import fs from 'fs'

const username = 'jgspns'
const accessToken = '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'
const repository = 'bus-data'
const filePath = 'lines-by-station.json'
const branch = 'main'

async function uploadOrUpdateFile(data) {

  const url = `https://api.github.com/repos/${username}/${repository}/contents/${filePath}`
  const rawUrl = `https://raw.githubusercontent.com/${username}/${repository}/${branch}/${filePath}`

  const content = Buffer.from(data).toString('base64')
  const body = {
    message: new Date().toJSON(),
    content: content,
    branch: branch
  }

  try {
    const existingFileResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${accessToken}`
      }
    })

    if (existingFileResponse.ok) {
      const existingFileData = await existingFileResponse.json()
      body.sha = existingFileData.sha
    }
    else if (existingFileResponse.status !== 404) {
      const errorMessage = `Failed to fetch file details: ${existingFileResponse.status} ${existingFileResponse.statusText}`
      throw new Error(errorMessage)
    }

    const updateResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })

    if (!updateResponse.ok) {
      const errorMessage = `Failed to update/create file: ${updateResponse.status} ${updateResponse.statusText}`
      throw new Error(errorMessage)
    }

    console.log(`
      Remote updated successfully: ${url}
      Raw url: ${rawUrl}
    `)
  }
  catch (error) {
    throw new Error(`Error occurred while updating/creating file: ${error}`)
  }
}

function consolidateData() {
  const linesByStation = {}
  const files = fs.readdirSync(`./scraped-data`)

  for (const file of files) {
    const content = fs.readFileSync(`./scraped-data/${file}`, { encoding: `utf-8` })
    const line = JSON.parse(content)

    for (const station of line.all_stations) {
      linesByStation[station.id] ??= new Set()
      linesByStation[station.id].add(line.line_number)
    }
  }

  for (const stationId in linesByStation) {
    linesByStation[stationId] = Array.from(linesByStation[stationId])
  }

  return JSON.stringify(linesByStation)
}

const json = consolidateData()
uploadOrUpdateFile(json)