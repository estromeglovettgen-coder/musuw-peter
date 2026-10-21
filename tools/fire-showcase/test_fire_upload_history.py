"""Real source scripts, Chromium image decoding, private HTTP upload and IndexedDB.

All pictures are synthetic local canvas/container fixtures; no provider or task
submission is started. Removal is local and recoverable, never a ledger delete.
"""
import json
import io
import random
import importlib.util
import os
import subprocess
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import fire_server


@unittest.skipUnless(os.environ.get('FIRE_SHOWCASE_TEST_CHROME'), 'Requires existing local Chromium')
class UploadHistoryBrowserTests(unittest.TestCase):
    def test_original_jpeg_upload_and_recoverable_local_collections(self):
        user, task_id = str(uuid.uuid4()), str(uuid.uuid4())
        writes = []
        history_reads = []
        history_asset_id = ''
        owner = self
        large_tiff = b''
        if importlib.util.find_spec('PIL') and importlib.util.find_spec('pillow_heif'):
            from PIL import Image
            surface=Image.frombytes('RGB',(1800,1800),random.Random(7921).randbytes(1800*1800*3))
            buffer=io.BytesIO();surface.save(buffer,format='TIFF');large_tiff=buffer.getvalue();surface.close()
        picture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

        class Fixture(fire_server.Handler):
            def do_GET(self):
                path = urlsplit(self.path).path
                if path == '/fixture-history-stats':
                    self.send_json(200, {'reads': len(history_reads)})
                    return
                if path == '/fixture-large-tiff':
                    self.send_response(200);self.send_header('Content-Type','image/tiff');self.send_header('Content-Length',str(len(large_tiff)));self.end_headers();self.wfile.write(large_tiff);return
                if path.startswith('/api/fire-showcase-assets/'+user+'/'):
                    if self.headers.get('Sec-Fetch-Dest') != 'image':
                        owner.assertEqual(self.headers.get('Authorization'), 'Bearer fixture-native-token')
                        if path.split('/')[-2] == history_asset_id:
                            history_reads.append(path)
                            if len(history_reads) == 1:
                                self.send_json(503, {'error': 'offline temporary image failure'})
                                return
                            time.sleep(0.12)
                    else:
                        # Native image URLs use their existing authenticated cookie.
                        self.headers['Authorization'] = 'Bearer fixture-native-token'
                    self.path='/api/v1/fire-showcase/api/assets/'+path.split('/')[-2]+'/content'
                if path == '/fixture-host':
                    content = ("<!doctype html><body><script>localStorage.setItem('weknora_user',JSON.stringify({id:"+json.dumps(user)+"}));localStorage.setItem('weknora_token','fixture-native-token');</script><iframe src='/tools/fire-showcase/'></iframe>").encode()
                    self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(content))); self.end_headers(); self.wfile.write(content)
                    return
                if path == '/api/v1/fire-showcase/bootstrap':
                    self.send_json(200, {'success': True, 'data': {'user_id': user, 'tenant_id': 7, 'allowance': {'status':'active','remaining_images':2}}})
                    return
                self.native_path()
                if urlsplit(self.path).path == '/api/generation-tasks':
                    self.send_json(200, {'tasks':[{'id':task_id,'status':'succeeded','createdAt':'2026-10-20T00:00:00Z','updatedAt':'2026-10-20T00:00:01Z','result':{'images':[picture]}},{'id':'fixture-unknown','status':'unknown','referenceCount':2,'createdAt':'2026-10-20T00:00:02Z'}]})
                    return
                return super().do_GET()

            def do_POST(self):
                path = urlsplit(self.path).path
                writes.append(path)
                self.native_path()
                if urlsplit(self.path).path == '/api/prompt':
                    self.send_json(200, {'prompt':'offline fixture','valid':False,'errors':[]})
                    return
                return super().do_POST()

            def send_json(self, status, data):
                if urlsplit(self.path).path=='/api/assets' and status==201:
                    owner.assertNotIn('normalizedDataUrl',data);owner.assertNotIn('normalizedDataUrl',data.get('asset',{}));owner.assertLess(len(json.dumps(data)),8192)
                    data['asset']['url']='/api/fire-showcase-assets/'+user+'/'+data['asset']['id']+'/content'
                if urlsplit(self.path).path == '/api/config' and status == 200:
                    data = {**data, 'fireIdentity': {'user_id': user, 'tenant_id': 7}, 'fireAllowance': {'status':'active','remaining_images':2}}
                return super().send_json(status, data)

            def native_path(self):
                prefix = '/api/v1/fire-showcase'
                if self.path.startswith(prefix+'/api/'):
                    owner.assertEqual(self.headers.get('Authorization'),'Bearer fixture-native-token')
                    self.path=self.path[len(prefix):]
                    self.headers['X-Fire-Bridge-Token']='fixture-bridge'
                    self.headers['X-Fire-User-ID']=user
                    self.headers['X-Fire-Tenant-ID']='7'

        with tempfile.TemporaryDirectory() as data:
            runtime=fire_server.FireRuntime(data,'fixture-bridge','http://127.0.0.1:1/internal',submit=lambda prepared: self.fail('never generate'))
            history_asset_id = runtime.owner(user, 7)[0].add_asset(picture, 'history-original.png')['id']
            picture = '/api/fire-showcase-assets/'+user+'/'+history_asset_id+'/content'
            with fire_server.ThreadingHTTPServer(('127.0.0.1',0),Fixture) as server:
                server.runtime=runtime
                thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                try:
                    result=subprocess.run(['node',str(Path(__file__).with_name('fire_upload_history_fixture.mjs')),f'http://127.0.0.1:{server.server_port}/fixture-host'],text=True,capture_output=True,timeout=75,env={**os.environ,'FIRE_SHOWCASE_TEST_CODECS':'1' if importlib.util.find_spec('PIL') and importlib.util.find_spec('pillow_heif') else '0'})
                    self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                    observed=json.loads(result.stdout)
                    print(json.dumps(observed,ensure_ascii=False))
                    self.assertFalse(any('generation-tasks' in path for path in writes),'collection controls must never submit/retry/delete a task')
                    for row in observed['formats']:
                        with self.subTest(format=row['name']):
                            if row['name']=='invalid.heic':
                                self.assertEqual(row['status'],'rejected','unsupported formats must fail before HTTP upload')
                                self.assertRegex(row['toast'],r'JPG|JPEG|格式|图片|素材')
                            elif row['name'].lower().endswith(('.gif','.bmp','.avif','.heic','.tiff')):
                                self.assertEqual(row['status'],'uploaded',row)
                                self.assertTrue(row['converted'] and row['pixelsPreserved'],'browser-decodable unsupported images must save full-resolution PNG with identical decoded pixels')
                                if row['name'].lower().endswith(('.heic','.tiff')):
                                    self.assertEqual(row['uploadRequests'],1,'server-normalized PNG must reuse the saved asset without a second upload')
                            else:
                                self.assertEqual(row['status'],'uploaded',row)
                                self.assertTrue(row['sameBytes'] and row['storedBytes'],'private stored original bytes must match browser file exactly')
                    for name, passed in observed['checks'].items():
                        with self.subTest(history=name):
                            self.assertTrue(passed)
                finally:
                    server.shutdown();thread.join()


if __name__=='__main__':
    unittest.main()
