const chalk = require('chalk');
const dns = require('dns');
const asciichart = require('asciichart')

const GRAPH_CONFIG = {
  height: 10,
  width: 80,
  offset: 2,
  padding: '        ',
};

const GRAPH_MAX = 60;
const GRAPH_TICK = 5;

const RE_PING_RESPONSE = /([\d]*) bytes from ([\d\.]*): icmp_seq=([\d]*) ttl=([\d]*) time=([\d\.]*) ms/;
const RE_TIMEOUT_RESPONSE = /Request timeout for icmp_seq ([\d]*)/

const ERROR_HIGHLIGHT = chalk.bgRed.white;
const SUCCESS_HIGHLIGHT = chalk.bgGreen.white;
const ERROR_NORMAL = chalk.red;
const SUCCESS_NORMAL = chalk.green;
const WARNING_NORMAL = chalk.yellow;

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let latencySum = 0;
let responseNum = 0;
let numTimeouts = 0;
let numOffline = 0;
let numOnline = 0;
let latencyGraph = [];
let lastGraphTick = GRAPH_TICK;

const push_to_graph = (latency) => {
  if (lastGraphTick === 0) {
    if (latencyGraph.length >= GRAPH_MAX) {
      latencyGraph.shift();
    }

    latencyGraph.push(latency);

    lastGraphTick = GRAPH_TICK;
  } else {
    lastGraphTick--;
  }
};

let dnsLookupStatus = [false, undefined, undefined];

setInterval(() => {
  dns.lookup('google.com', (err, address) => {
    dnsLookupStatus = true;

    if (err) {
      dnsLookupStatus = false;
    }

    if (!address) {
      dnsLookupStatus = false;
    }
  })
}, 1000);

rl.on('line', function(line) {
  const responseMatch = RE_PING_RESPONSE.exec(line);
  const timeoutMatch = RE_TIMEOUT_RESPONSE.exec(line);

  let isOnline = false;
  let lastLatency = '';
  let latencyLevel = 'ok';

  if (responseMatch) {
    const bytes = parseInt(responseMatch[1], 10);
    const ip = responseMatch[2];
    const icmp = parseInt(responseMatch[3], 10);
    const ttl = parseInt(responseMatch[4], 10);
    const time = parseFloat(responseMatch[5]);

    responseNum++;
    latencySum += time;

    console.log('TIME: ', time);
    console.log('RAW:', responseMatch[5]);

    lastLatency = `${time}`;

    push_to_graph(time);

    // Include DNS lookups in this check
    // ping will often work on mobile but DNS lookups fail so it's a false-positive
    if (time > 1000 || dnsLookupStatus === false) {
      numOffline++;
    } else {
      isOnline = true;
      numOnline++;
    }

    if (time > 1000) {
      latencyLevel = 'error';
    } else if (time > 100) {
      latencyLevel = 'warning';
    } else {
      latencyLevel = 'ok';
    }
  } else if (timeoutMatch) {
    numTimeouts++;
    numOffline++;

    push_to_graph(0);

    latencyLevel = 'error';
    lastLatency = 'timeout';
  } else {
    return;
  }

  console.clear();

  console.log(chalk.underline.bold('CURRENT STATE'));

  if (isOnline) {
    console.log(SUCCESS_HIGHLIGHT('Online'));
  } else {
    console.log(ERROR_HIGHLIGHT('Offline'));
  }

  if (dnsLookupStatus) {
    console.log(SUCCESS_NORMAL(`DNS: true`));
  } else {
    console.log(ERROR_NORMAL(`DNS: false`));
  }

  switch(latencyLevel) {
    case 'ok':
      console.log(SUCCESS_NORMAL(`Latency: ${lastLatency}`));
      break;
    case 'warning':
      console.log(WARNING_NORMAL(`Latency: ${lastLatency}`));
      break;
    case 'error':
      console.log(ERROR_NORMAL(`Latency: ${lastLatency}`));
      break;
  }

  console.log();
  console.log(chalk.underline.bold('TRIP SUMMARY'));
  console.log('Average latency: ', (latencySum / responseNum).toPrecision(5));
  console.log('Timeouts:', numTimeouts);
  console.log('Offline time:', numOffline);
  console.log('Online time:', numOnline);
  console.log('Online Percentage:', `${((numOnline / (numOnline + numOffline)) * 100).toPrecision(4)}%`);
  console.log();

  if (latencyGraph.length > 2) {
    console.log(asciichart.plot(latencyGraph, GRAPH_CONFIG));
  }
});
