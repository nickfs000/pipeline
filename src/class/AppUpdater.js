const electron = require('electron')
const os = require('os')
const autoUpdater = electron.autoUpdater
const appVersion = require('../../package.json').version

let updateFeed = ''
let initialized = false
const platform = `${os.platform()}_${os.arch()}`
const nutsURL = 'https://pipeline-release-auto-update.herokuapp.com'

if (os.platform() === 'darwin') {
  updateFeed = `${nutsURL}/update/${platform}/${appVersion}`
} else if (os.platform() === 'win32') {
  updateFeed = `${nutsURL}/update/win32/${appVersion}`
}
console.log('feedurl', updateFeed);
function init(mainWindow) {
  mainWindow.webContents.send('console', `App version: ${appVersion}`)
  mainWindow.webContents.send('message', { msg: `🖥 App version: ${appVersion}` })

  if (initialized || !updateFeed || process.env.NODE_ENV === 'development') { return }

  initialized = true

  autoUpdater.setFeedURL(updateFeed)

  autoUpdater.on('error', (ev, err) => {
    console.log('>>>> error', err);
    mainWindow.webContents.send('message', { msg: `😱 Error: ${err}` })
  })

  autoUpdater.once('checking-for-update', (ev, err) => {
    console.log('>>>> checking-for-update', err);
    mainWindow.webContents.send('message', { msg: '🔎 Checking for updates' })
  })

  autoUpdater.once('update-available', (ev, err) => {
    console.log('>>>> update-available', err);
    mainWindow.webContents.send('message', { msg: '🎉 Update available. Downloading ⌛️', hide: false })
  })

  autoUpdater.once('update-not-available', (ev, err) => {
    console.log('>>>> update-not-available', err);
    mainWindow.webContents.send('message', { msg: '👎 Update not available' })
  })

  autoUpdater.once('update-downloaded', (ev, err) => {
    console.log('>>>> update-downloaded', err);
    const msg = '<p style="margin: 0;">🤘 Update downloaded - <a onclick="quitAndInstall()">Restart</a></p>'
    mainWindow.webContents.send('message', { msg, hide: false, replaceAll: true })
  })

  autoUpdater.checkForUpdates()
}

module.exports = {
  init
}