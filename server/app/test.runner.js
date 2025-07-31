const { setTimeout } = require('timers/promises');
const { spawn } = require('child_process');
const http = require('http');

let server;

function waitForServerReady(port = 3000, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    (function poll() {
      const req = http.get(`http://localhost:${port}`, () => resolve());
      req.on('error', () => {
        if (Date.now() < deadline) {
          setTimeout(200).then(poll);
        } else {
          reject(new Error('Server not responding in time'));
        }
      });
    })();
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
  process.exit(1);
});

async function runUvu() {
  return new Promise((resolve, reject) => {
    const uvuProcess = spawn('npx', ['uvu', './app/tests/'], {
      stdio: 'inherit',
      shell: true,
    });

    uvuProcess.on('error', (err) => reject(err));
    uvuProcess.on('close', (code) => resolve(code));
  });
}

/**
 * TEST ENTRY POINT
 * Spawns Databus Server and then runs the test suite
 */
async function run() {
  server = spawn('node', ['--trace-warnings', 'www'], {
    cwd: '../server',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServerReady(3000, 5000);

    const code = await runUvu();

  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    if (server) server.kill();
  }
}

run();
