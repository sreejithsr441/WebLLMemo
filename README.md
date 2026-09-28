# WebLLM demo: AI in your browser

The live demo from the video **"WebLLM Explained Simply: Run AI in Your Browser"**.
A private AI chat that runs entirely in your browser tab with [WebLLM](https://github.com/mlc-ai/web-llm) and WebGPU:
no server, no sign-up, and after the first download it works with the Wi-Fi off.

**Try it:** https://YOUR-USERNAME.github.io/webllm-demo/  ·  **The dozen lines from the video:** [minimal.html](minimal.html)

## What's inside (it follows the video)

| File | What it does | In the video |
|---|---|---|
| `index.html`, `app.js`, `style.css` | WebGPU check → pick a small model → progress bar → streaming chat | sections 3, 4, 5 |
| `worker.js` | the "helper in the background" (a web worker), so the page never freezes | section 5 |
| `minimal.html` | the exact dozen lines shown on screen, nothing else | section 5 |

No build step and no install: the pages load WebLLM from a CDN (`esm.run`) and the models from Hugging Face.

## Requirements

- A laptop or desktop with a recent **Chrome or Edge** (Safari 26+ also has WebGPU).
- The first load downloads the model once (about 350 MB for the smallest). After that it's saved in the browser.
- Phones may not have enough graphics memory yet; the page tells you if so.

## Put it online with GitHub Pages (free)

1. Create a new public repository on GitHub, e.g. `webllm-demo`.
2. Upload every file in this folder (drag them onto the repo page → **Commit changes**).
3. Go to **Settings → Pages**, set **Source: Deploy from a branch**, **Branch: main / (root)**, then **Save**.
4. After a minute your demo is live at `https://YOUR-USERNAME.github.io/webllm-demo/`.

WebGPU only works on secure pages (HTTPS or `localhost`), and GitHub Pages gives you HTTPS automatically.

## Run it on your own computer

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` straight from the folder won't work, because web workers need a local server.)

## License

MIT. Built on WebLLM (Apache-2.0) by the MLC team.
