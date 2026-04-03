# Ledger

A poker game tracker that runs entirely in your browser. All session data is stored in localStorage — no account, no server, no data leaving your device.

## Live App

**[https://ahtsisab.github.io/Ledger](https://ahtsisab.github.io/Ledger)**

## Features

- Track poker sessions with buy-ins, cash-outs, and net profit/loss
- Persistent storage via browser localStorage
- No backend required

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Deployment

The app is automatically deployed to GitHub Pages on every push to `main` via GitHub Actions.

To deploy manually:

```bash
npm run deploy
```

This builds the app and pushes the `dist` folder to the `gh-pages` branch.
