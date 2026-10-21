"""Cold browser resource bursts must not wait for TCP SYN retransmission."""
from concurrent.futures import ThreadPoolExecutor
import http.client
import tempfile
import threading
import time
import unittest

import fire_server


class ColdConnectionTests(unittest.TestCase):
    def test_sixteen_simultaneous_cold_resources_finish_without_a_retransmission_wait(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = fire_server.FireRuntime(directory, "fixture-bridge", "http://127.0.0.1:1/internal")
            with fire_server.make_server(runtime, "127.0.0.1", 0) as server:
                accept = server.get_request
                # A brief scheduler pause models thread creation during a cold
                # resource burst; every request still executes the real server.
                def scheduled_accept():
                    time.sleep(0.015)
                    return accept()
                server.get_request = scheduled_accept
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                barrier = threading.Barrier(16)
                def get_resource(_):
                    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                    barrier.wait()
                    began = time.monotonic()
                    try:
                        connection.request("GET", "/tools/fire-showcase/workbench.css")
                        response = connection.getresponse()
                        body = response.read()
                        return response.status, bool(body), time.monotonic() - began
                    finally:
                        connection.close()
                try:
                    with ThreadPoolExecutor(max_workers=16) as pool:
                        results = list(pool.map(get_resource, range(16)))
                    self.assertTrue(all(status == 200 and content for status, content, _ in results))
                    self.assertLess(max(seconds for _, _, seconds in results), 0.9,
                        "A cold public resource burst queued for a full TCP retransmission interval")
                finally:
                    server.shutdown()
                    thread.join()


if __name__ == "__main__":
    unittest.main()
