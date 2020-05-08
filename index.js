#!/usr/bin/env node

const chalk = require('chalk');
const dns = require('dns');
const asciichart = require('asciichart')


const GRAPH_MAX = 180;
const GRAPH_TICK = 0;
const MAX_GRAPH_VALUE = 300;  // Maximum y-height represents max usable ping latency

const GRAPH_CONFIG = {
  height: 40,
  width: GRAPH_MAX,
  offset: 2,
  padding: '        ',
};

// Minimum latency to consider unusable
const TIMEOUT_LATENCY_MIN = 101;

const RE_PING_RESPONSE_UNIX = /([\d]*) bytes from ([\d\.]*): icmp_seq=([\d]*) ttl=([\d]*) time=([\d\.]*) ms/;
const RE_TIMEOUT_RESPONSE_UNIX = /Request timeout for icmp_seq ([\d]*)/

const RE_PING_RESPONSE_WIN32 = /.* from ([\d\.]*): bytes=([\d]*) time=([\d\.]*).?ms TTL=([\d]*)/;
const RE_TIMEOUT_RESPONSE_WIN32 = /.*[(timeout)|(failure)|(timed out)].*/

// Should check OS and do this automatically
const RE_PING_RESPONSE = RE_PING_RESPONSE_WIN32;
const RE_TIMEOUT_RESPONSE = RE_TIMEOUT_RESPONSE_WIN32;

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
let maxTimeOnline = 0;
let currentTimeOnline = 0;
let latencyGraph = [];
let lastGraphTick = GRAPH_TICK;

const push_to_graph = (latency) => {
  if (lastGraphTick === 0) {
    if (latencyGraph.length >= GRAPH_MAX) {
      latencyGraph.shift();
    }

    if (latency > MAX_GRAPH_VALUE) {
      latencyGraph.push(MAX_GRAPH_VALUE);
    } else {
      latencyGraph.push(latency);
    }

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

rl.on('line', function (line) {
  const responseMatch = RE_PING_RESPONSE.exec(line);
  const timeoutMatch = RE_TIMEOUT_RESPONSE.exec(line);

  let isOnline = false;
  let lastLatency = '';
  let latencyLevel = 'ok';

  if (responseMatch) {
    const ip = responseMatch[1];
    const bytes = parseInt(responseMatch[2], 10);
    const time = parseFloat(responseMatch[3]);
    const ttl = parseInt(responseMatch[4], 10);

    responseNum++;
    latencySum += time;

    lastLatency = `${time}`;

    push_to_graph(time);

    // Include DNS lookups in this check
    // ping will often work on mobile but DNS lookups fail so it's a false-positive
    if (time > TIMEOUT_LATENCY_MIN || dnsLookupStatus === false) {
      numOffline++;
      isOnline = false;
    } else {
      isOnline = true;
      numOnline++;
    }

    if (time > TIMEOUT_LATENCY_MIN) {
      latencyLevel = 'error';
    } else if (time > 100) {
      latencyLevel = 'warning';
    } else {
      latencyLevel = 'ok';
    }
  } else if (timeoutMatch) {
    numTimeouts++;
    numOffline++;

    latencyLevel = 'error';
    lastLatency = 'timeout';
    isOnline = false;

    // Show high number on graph to represent timeout
    push_to_graph(MAX_GRAPH_VALUE);
  } else {
    return;
  }

  if (isOnline) {
    currentTimeOnline++;

    if (currentTimeOnline > maxTimeOnline) {
      maxTimeOnline = currentTimeOnline;
    }
  } else {
    currentTimeOnline = 0;
  }

  console.clear();

  let jitter = (latencyGraph.reduce((p, c, i, a) => (i === 0) ? 0 : (p + Math.abs(a[i] - a[i - 1])), 0) / responseNum).toFixed(1);
  console.log();
  console.log(`${(latencySum / responseNum).toFixed(1)} ms (${Math.min(...latencyGraph)} to ${Math.max(...latencyGraph)} ms) ${jitter} ms`);
  console.log();

  if (latencyGraph.length > 2) {
    console.log(asciichart.plot(latencyGraph, GRAPH_CONFIG));
  }

  console.log();
  console.log(`${(isOnline) ? SUCCESS_HIGHLIGHT('Online') : ERROR_HIGHLIGHT('Offline')} ${((numOnline / (numOnline + numOffline)) * 100).toFixed(1)}% (${numOnline}s:${numOffline}s) ${numTimeouts} timed out. ${dnsLookupStatus ? 'Using DNS' : ''}`);

  switch ('off' || latencyLevel) {
    case 'ok':
      console.log(SUCCESS_NORMAL(`Latency: ${lastLatency}`));
      break;
    case 'warning':
      console.log(WARNING_NORMAL(`Latency: ${lastLatency}`));
      break;
    case 'error':
      console.log(ERROR_NORMAL(`Latency: ${lastLatency}`));
      break;
    default:
      break;
  }

});
