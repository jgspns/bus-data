import sampledStations from './sampled-stations.json' assert { type: 'json' }
import fs from 'fs'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function timestamp() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return '[' + now.toISOString().replace('T', ' ').replace('Z', '') + ']'
}

const lines = [
  "3A", "3AB", "3BB", "9B", "9AB", "60B", "61B", "62B", "63B", "64B", 
  "69B", "3B", "3AA", "3BA", "9A", "9AA", "60A", "61A", "62A", "63A", 
  "64A", "69A", "56B", "56A", "12B", "13A", "18B", "2B", "4B", "5B", 
  "5NA", "6B", "10B", "14B", "15B", "18A", "51B", "52B", "53B", "54B", 
  "55B", "5A", "7B", "14A", "41A", "42A", "43A", "16B", "20B", "31B", 
  "32B", "33B", "25B", "1B", "1ZB", "35A", "35ČLA", "2A", "6A", "51A", 
  "52A", "53A", "54A", "55A", "4A", "8B", "11A", "12A", "13B", "16A", 
  "1A", "1ZA", "8A", "11B", "19B", "68B", "71B", "72B", "73B", "74B", 
  "76B", "77B", "78B", "79B", "80B", "81B", "84B", "86B", "5NB", "10A", 
  "15A", "17A", "7A", "19A", "68A", "71A", "72A", "73A", "74A", "76A", 
  "41B", "42B", "43B", "20A", "30A", "31A", "32A", "33A", "35B", "35ČLB", 
  "77A", "78A", "79A", "80A", "81A", "84A", "86A", "21A", "22A", "23A", 
  "24A", "25A", "21B", "22B", "23B", "24B", "30B", "6AA", "6AB"
]

const entries = Object.entries(sampledStations)

console.log(`${timestamp()} Scraping ${entries.length} stations`)

while (true) {

  console.log(`${timestamp()} Found ${fs.readdirSync('./scraped-data').length}/${lines.length} lines in total`)

  for (let i = 0; i < entries.length; i++) {

    const [stationId, stations] = entries[i]
    const request = {
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
    
    try {
      console.log(`${timestamp()} Scraping station ${i + 1}/${entries.length} ID=${stationId}`)
      response = await fetch("https://online.nsmart.rs/sr/najava-dolaska/", request)
    }
    catch (error) {
      console.log(`${timestamp()} Failed to scrape station ID=${stationId}.  Error: ${error}`)
      continue
    }

    if (!response.ok) {
      console.log(`
        ${timestamp()} Failed to scrape station ${stationId}. 
        Error: ${response.status} - ${response.statusText}
      `)
      continue
    }

    const data = await response.json()
    console.log(`${timestamp()} Scraped station ID=${stationId} successfully`)

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
 
    console.log(`${timestamp()} Sleeping for 5 seconds...`)
    console.log()

    await sleep(5000)
  }

  console.log(`${timestamp()} Sleeping for 30 seconds...`)
  console.log()

  await sleep(30000)

}
