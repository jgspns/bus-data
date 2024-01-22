import { JSDOM } from 'jsdom'
import { ProxyAgent } from 'undici'
import fs from 'fs'

const logLevel = 'info'

const second = 1000
const minute = 60 * second
const hour = 60 * minute
const day = 24 * hour

const lineNumbersQueue = new Set()
const sampledStations = new Set()

function timestamp() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return '[' + now.toISOString().replace('T', ' ').replace('Z', '') + ']'
}

function log(string, level = 'debug') {
  logLevel.includes(level) && console.log(`${timestamp()} - ${string}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function infiniteRetry(fn, options = { report: false }) {
  while (true) {
    try { return await fn() }
    catch (error) {
      options.report && logLevel.includes('debug') && console.log(error.stack) 
      await sleep(1 * second)
      log(`Retrying function "${fn.name}()"`) 
    }
  }
}

function popFront(set) {
  try { 
    const value = set.values().next().value
    set.delete(value)
    return value
  }
  catch { return null }
}

const parseHtml = (html) => new JSDOM(html).window.document

async function getProxy() {
  // log('Getting new proxy')
  // const response = await fetch('http://127.0.0.1:8000/proxies/random')
  // const json = await response.json()
  // return `http://${json.ip}:${json.port}`
  return 'http://i9ip7pk06246hi2:lf9mwf5utchyyc7@rp.proxyscrape.com:6060'
}

async function deleteProxy(proxy) {
  log('Deleteing proxy ' + proxy)
  await fetch(`http://127.0.0.1:8000/proxies/${proxy}/delete`, { method: 'POST' })
}

async function getLineNumbers() {
  const proxy = await getProxy()
  log('Fetching HTML for all lines "/prikaz-svih-linija"', 'info')
  const response = await fetch('http://online.nsmart.rs/sr/prikaz-svih-linija', { 
    dispatcher: new ProxyAgent(proxy), 
    signal: AbortSignal.timeout(16000) 
  })
  .catch(() => log(`Proxy ${proxy} blew`))
  
  if (!response?.ok) {
    log('Failed fetching all lines with status ' + response?.status)
    await deleteProxy(proxy)
    throw new Error()
  }

  log('Parsing HTML for all lines into DOM')
  const html = await response.text()
  const document = parseHtml(html)

  log('Querying line numbers in DOM')
  const rows = Array.from(document.querySelectorAll('.display_lines_tr_forms'))
  const lineNumbers = rows.map(row => row?.id?.split?.('_')?.[1]).filter(e => e != null)
  
  const uniqueLineNumbers = Array.from(new Set(lineNumbers))
  log('Found ' + uniqueLineNumbers.length + ' lines in "getLineNumbers()": ' + uniqueLineNumbers.join(', '), 'info')

  return Array.from(uniqueLineNumbers)
}

async function getLastStation(lineNumber) { 
  const proxy = await getProxy()
  log('Fetching HTML for line ' + lineNumber)
  const response = await fetch(`http://online.nsmart.rs/sr/line_details/${lineNumber}`, { 
    dispatcher: new ProxyAgent(proxy),
    signal: AbortSignal.timeout(16000) 
  })
  .catch(() => log(`Proxy ${proxy} blew`))
  
  if (!response?.ok) {
    log(`Failed fetching line ${lineNumber} with status ${response?.status}`)
    await deleteProxy(proxy)
    throw new Error()
  }

  log(`Parsing HTML for line ${lineNumber} into DOM`)
  const html = await response.text()
  const document = parseHtml(html)

  log(`Querying station number in DOM for line ${lineNumber}`)
  const link = Array.from(document.querySelectorAll('.select_station:last-child')).pop()
  const stationNumber = link?.id?.split?.('_')?.[1]

  if (stationNumber) log(`Found station ${stationNumber} for line ${lineNumber} ✅`, 'info')
  else log(`No station found for line ${lineNumber} ❌`, 'info')
  return stationNumber
}

async function queueProcessor() {
  await sleep(Math.random() * 1500 + 500)
  while (lineNumbersQueue.size) {
    log('Lines queue size: ' + lineNumbersQueue.size, 'info')
    const lineNumber = popFront(lineNumbersQueue)
    if (!lineNumber) continue

    try{
      const stationNumber = await getLastStation(lineNumber)
      if (!stationNumber) throw new Error()
      sampledStations.add(Number(stationNumber))
    }
    catch {
      lineNumbersQueue.add(lineNumber)
    }

    await sleep(2 * second)
  }
}

async function sampleStations() {
  log('Starting to sample stations', 'info')
  const lineNumbers = await infiniteRetry(getLineNumbers, { report: true })
    
  for (const ln of lineNumbers) {
    lineNumbersQueue.add(ln)
  }
  
  await Promise.all(Array(16).fill().map(queueProcessor))

  fs.writeFileSync(
    `./scraped-data/sampled-stations.json`, 
    JSON.stringify(Array.from(sampledStations), null, 2), 
    { encoding: `utf-8`, flag: `w` }
  )

  log('Sleeping for 12H before sampling stations again', 'info')
  await sleep(12 * hour)
}

function scraper() {
  log('Starting scraper', 'info')
  return infiniteRetry(sampleStations, { report: true })
}

await scraper()