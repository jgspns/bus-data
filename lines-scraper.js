import { ProxyAgent } from 'undici'
import sampledStations from './sampled-stations.json' assert { type: 'json' }
import fs from 'fs'

const encodedProxy = Buffer.from('aHR0cDovL2k5aXA3cGswNjI0NmhpMjo4YzJqYXowNHBjOXU3anJAcnAucHJveHlzY3JhcGUuY29tOjYwNjA=', 'base64').toString()
const proxy = new ProxyAgent(encodedProxy) // Crawler bot protection

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function timestamp() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return '[' + now.toISOString().replace('T', ' ').replace('Z', '') + ']'
}

console.log(`${timestamp()} Scraping ${sampledStations.length} stations`)

while (true) {
  console.log(`${timestamp()} Found ${fs.readdirSync('./scraped-data').length} lines in total`)
  for (const stationId of sampledStations) {
    const request = {
      dispatcher: proxy,
      signal: AbortSignal.timeout(15000), 
      "headers": {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "accept-language": "sr,en-US;q=0.9,en;q=0.8,sr-RS;q=0.7,zh-CN;q=0.6,zh;q=0.5",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"114\", \"Google Chrome\";v=\"114\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-requested-with": "XMLHttpRequest",
        "cookie": "PHPSESSID=k9b862q465j4aa3ii2t4nlff04; privacy-cards=1688175312-1144; _ga=GA1.2.607619421.1688175314; _gid=GA1.2.326310449.1688175314; session_timeout=1688262190; _ga_P7D6Y5K462=GS1.2.1688175313.1.1.1688175794.0.0.0",
        "Referer": "https://online.nsmart.rs/sr/najava-dolaska",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      },
      "body": "station_uid=" + stationId + "&ibfm=TS001831&direction=2&company_info_id=216&radius=1",
      "method": "POST"
    }

    let response 
    let data

    try {
      console.log(`${timestamp()} Scraping station ID=${stationId}`)
      response = await fetch("https://online.nsmart.rs/sr/najava-dolaska/", request)

      if (!response.ok) {
        console.log(`
          ${timestamp()} Failed to scrape station ${stationId}. 
          Error: ${response.status} - ${response.statusText}
        `)
        continue
      }

      data = await response.json()
      console.log(`${timestamp()} Scraped station ID=${stationId} successfully`)
    }
    catch (error) {
      console.log(`${timestamp()} Failed to scrape station ID=${stationId}.  Error: ${error}`)
      continue
    }

    for (const line of data) {

      if (!line.actual_line_number) {
        console.log(`${timestamp()} Skipping station ID=${stationId} because it has no "actual_line_number"`)
        continue
      }

      fs.writeFileSync(
        `./scraped-data/${line.actual_line_number}.json`, 
        JSON.stringify(line, null, 2), 
        { encoding: `utf-8`, flag: `w` }
      )
      
      console.log(`${timestamp()} Writing station ID=${stationId} to file ${line.actual_line_number}.json`)
    }
 
    console.log(`${timestamp()} Sleeping for 10 seconds...`)
    console.log()

    await sleep(10000)
  }

  console.log(`${timestamp()} Sleeping for 60 seconds...`)
  console.log()

  await sleep(60000)

}
