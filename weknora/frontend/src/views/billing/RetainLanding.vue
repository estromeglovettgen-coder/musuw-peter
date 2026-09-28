<template>
  <main class="retain-landing">
    <section class="retain-landing__card" aria-labelledby="retain-title">
      <img class="retain-landing__logo" src="/musuw-logo.png" alt="musuw" />
      <p class="retain-landing__eyebrow">musuw</p>
      <h1 id="retain-title">Your AI workspace, ready when you are.</h1>
      <p class="retain-landing__summary">
        Build private knowledge spaces, ask better questions, and keep your work moving in one focused workspace.
      </p>
      <nav class="retain-landing__actions" aria-label="Musuw links">
        <a class="retain-landing__primary" href="/auth/start">Sign in to musuw</a>
        <a class="retain-landing__secondary" href="https://musuw.com/">Visit musuw.com</a>
      </nav>
    </section>
  </main>
</template>

<style scoped lang="less">
.retain-landing {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 32px;
  background: #f5f7f8;
  color: #15231e;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.retain-landing__card {
  width: min(620px, 100%);
  padding: clamp(32px, 6vw, 64px);
  border: 1px solid #dce5e1;
  border-radius: 28px;
  background: #fff;
  box-shadow: 0 24px 70px rgb(26 55 44 / 10%);
  text-align: center;
}

.retain-landing__logo { width: 64px; height: 64px; object-fit: contain; }
.retain-landing__eyebrow { margin: 18px 0 0; color: #39715c; font-weight: 750; letter-spacing: .16em; text-transform: uppercase; }
.retain-landing h1 { margin: 14px 0 0; font-size: clamp(34px, 6vw, 52px); line-height: 1.05; letter-spacing: -.04em; }
.retain-landing__summary { max-width: 500px; margin: 22px auto 0; color: #52625c; font-size: 17px; line-height: 1.65; }
.retain-landing__actions { margin-top: 34px; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.retain-landing__actions a { min-height: 46px; padding: 0 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-weight: 700; text-decoration: none; }
.retain-landing__primary { background: #173f31; color: #fff; }
.retain-landing__secondary { border: 1px solid #cbd8d3; color: #173f31; }

@media (max-width: 520px) {
  .retain-landing { padding: 18px; }
  .retain-landing__actions { flex-direction: column; }
}
</style>
