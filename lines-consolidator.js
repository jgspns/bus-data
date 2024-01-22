import fs from 'fs/promises'

const username = 'jgspns'
const accessToken = 'REDACTED'
const repository = 'bus-data'
const branch = 'main'

async function uploadOrUpdateFile(data, filePath) {

  const url = `https://api.github.com/repos/${username}/${repository}/contents/${filePath}`
  const rawUrl = `https://raw.githubusercontent.com/${username}/${repository}/${branch}/${filePath}`

  const content = Buffer.from(data).toString('base64')
  const body = {
    message: new Date().toJSON(),
    content: content,
    branch: branch
  }

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

  // Continue if status is 404 (file doesn't exist on remote)

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

async function read() {
  const lines = []
  const lineRoutes = {}

  const files = await fs.readdir("./data/lines")
  await Promise.all(
    files.map(async (fileName) => {
      const file = await fs.readFile(`./data/lines/${fileName}`, "utf-8")
      const json = JSON.parse(file)
      const { id, actual_line_number, line_number, line_title, all_stations, line_route } = json

      const stations = all_stations.map((station) => {
        return {
          id: station.id.toString(),
          name: station.name,
          coordinates: {
            latitude: Number(station.coordinates.latitude),
            longitude: Number(station.coordinates.longitude)
          }
        }
      })

      const route = line_route.map((lineString) => {
        const coords = lineString.split(",")
        const longitude = Number(coords[0])
        const latitude = Number(coords[1])
        return { latitude, longitude }
      })

      const line = {
        id,
        stations,
        actualLineNumber: actual_line_number,
        displayLineNumber: line_number,
        title: line_title
      }

      lines.push(line)
      lineRoutes[line.id] = route
    })
  )

  const linesJson = JSON.stringify(lines)
  const lineRoutesJson = JSON.stringify(lineRoutes)

  fs.writeFile("./data/lines.json", linesJson, (err) => {
    if (err) console.log(err)
    else {
      console.log("File ./data/lines.json written successfully\n")
    }
  })

  await uploadOrUpdateFile(linesJson, 'data/lines.json')

  fs.writeFile("./data/line-routes.json", lineRoutesJson, (err) => {
    if (err) console.log(err)
    else {
      console.log("File ./data/line-routes.json written successfully\n")
    }
  })

  await uploadOrUpdateFile(lineRoutesJson, 'data/line-routes.json')
}

export function sortLines(lines) {
  return lines.sort(function (a, b) {
    const numA = parseInt(a)
    const numB = parseInt(b)

    // Extract non-numeric parts
    const nonNumA = a.replace(/\d+/g, "") || ""
    const nonNumB = b.replace(/\d+/g, "") || ""

    // Compare numeric parts
    if (numA !== numB) {
      return numA - numB
    }

    // If numeric parts are equal, compare non-numeric parts
    return nonNumA.localeCompare(nonNumB)
  })
}

await read()