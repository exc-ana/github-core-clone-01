// Standalone server for local grading: node test/run-server.mjs [port]
// Env: MAKEFUN_SHOP_TOKEN (default 'test-token')
import { createApp } from '../app.ts';
const port = Number(process.argv[2] ?? '18080');
const server = createApp();
server.listen(port, () => console.log(`[test] listening on ${port}`));
