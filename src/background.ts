import { cleanDomain } from './util'
import { getStorage, setStorage, addToBlocked, addToWhitelist, removeFromBlocked } from './storage'
import setupContextMenus from './context_menus'
import { Intent } from './types'
import { setBadgeUpdate, cleanupBadge, badgeCountDown } from './badge'
import { listenForCommand } from './commands'

// On install script
chrome.runtime.onInstalled.addListener((details) => {
  // on first time install
  if (details.reason === 'install') {
    chrome.tabs.create({
      // redir to onboarding url
      url: 'http://getreflect.app/onboarding',
      active: true,
    })

    firstTimeSetup()
  }

  // on version update
  const prevVersion: string = details.previousVersion
  const thisVersion: string = chrome.runtime.getManifest().version
  if (details.reason === 'update') {
    // Migrate existing users: if they had isEnabled=true, activate all blocked sites
    getStorage().then((storage) => {
      if (storage.isEnabled && storage.blockedSites && !storage.activeSites) {
        // This is an upgrade from old version, activate all blocked sites
        setStorage({ activeSites: [...storage.blockedSites] })
      } else if (!storage.activeSites) {
        // Ensure activeSites exists
        setStorage({ activeSites: [] })
      }
    })

    if (prevVersion != thisVersion) {
      chrome.tabs.create({
        // redir to latest release patch notes
        url: 'http://getreflect.app/latest',
        active: true,
      })

      console.log(`Updated from ${prevVersion} to ${thisVersion}!`)
    }
  }

  // set uninstall url
  chrome.runtime.setUninstallURL('http://getreflect.app/uninstall')
})

function firstTimeSetup(): void {
  // Default to off for all sites
  turnFilteringOff()

  // set whitelist
  const whitelist: { [key: string]: string } = {}
  const intentList: { [key: string]: Intent } = {}
  const blockedSites: string[] = ['facebook.com', 'twitter.com', 'instagram.com', 'youtube.com']
  const activeSites: string[] = []  // No sites active by default

  setStorage({
    whitelistedSites: whitelist,
    intentList: intentList,
    numIntentEntries: 20,
    customMessage: '',
    enableBlobs: true,
    enable3D: true,
    blockedSites: blockedSites,
    activeSites: activeSites,
    isEnabled: false,  // Global off by default
  }).then(() => {
    console.log('Default values have been set.')
  })

  // set default badge background colour
  chrome.action.setBadgeBackgroundColor({
    color: '#576ca8',
  })
}

// On Chrome startup, setup extension icons
chrome.runtime.onStartup.addListener(() => {
  getStorage().then((storage) => {
    const activeSites = storage.activeSites || []
    const hasActiveSites = activeSites.length > 0
    const icon = hasActiveSites ? 'res/on.png' : 'res/off.png'
    
    chrome.action.setIcon({ path: { '16': icon } })
    
    // Start badge updates if any sites are active
    if (hasActiveSites) {
      setBadgeUpdate()
    }
  })
})

function turnFilteringOff(): void {
  setStorage({ isEnabled: false }).then(() => {
    // stop checking for badge updates
    cleanupBadge()

    chrome.action.setIcon({ path: 'res/off.png' }, () => {
      console.log('Filtering disabled')
    })
    reloadActive()
  })
}

function turnFilteringOn(): void {
  setStorage({ isEnabled: true }).then(() => {
    // start badge update counter
    setBadgeUpdate()

    chrome.action.setIcon({ path: 'res/on.png' }, () => {
      console.log('Filtering enabled.')
    })
    reloadActive()
  })
}

// reloads tab that is currently in focus
function reloadActive(): void {
  getStorage().then((storage) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = cleanDomain(tabs.map((tab) => tab.url))
      const activeSites = storage.activeSites || []
      if (activeSites.includes(currentUrl)) {
        chrome.tabs.reload(tabs[0].id)
      }
    })
  })
}

// Catch menu clicks (page context and browser action context)
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'baFilterListMenu':
      chrome.runtime.openOptionsPage()
      break
    case 'baAddSiteToFilterList':
    case 'pgAddSiteToFilterList':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const urls: string[] = tabs.map((x) => x.url)
        const url = cleanDomain(urls, true)
        addToBlocked(url)
        // Also activate the site
        getStorage().then((storage) => {
          let activeSites = storage.activeSites || []
          if (!activeSites.includes(url)) {
            activeSites.push(url)
            setStorage({ activeSites }).then(() => {
              chrome.action.setIcon({ path: 'res/on.png' })
            })
          }
        })
      })
      break
    case 'baAddDomainToFilterList':
    case 'pgAddDomainToFilterList':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const urls: string[] = tabs.map((x) => x.url)
        const domain: string = cleanDomain(urls)
        addToBlocked(domain)
        // Also activate the site
        getStorage().then((storage) => {
          let activeSites = storage.activeSites || []
          if (!activeSites.includes(domain)) {
            activeSites.push(domain)
            setStorage({ activeSites }).then(() => {
              chrome.action.setIcon({ path: 'res/on.png' })
            })
          }
        })
      })
      break
  }
})

// load context menus
setupContextMenus()

// Listen for alarms (for badge updates in V3)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'badgeUpdate') {
    badgeCountDown()
  }
})

// Listen for new signals from non-background scripts
chrome.runtime.onConnect.addListener((port) => {
  // check comm channel
  switch (port.name) {
    // listens for messages from content scripts
    case 'intentStatus': {
      port.onMessage.addListener((msg) => intentHandler(port, msg))
    }
  }
})

// handle content script intent submission - now always allows access
async function intentHandler(port: chrome.runtime.Port, msg) {
  // extract intent and whitelist time from message
  const intent: string = msg.intent
  const whitelistTime: number = msg.whitelistTime || 15 // Default to 15 minutes if not provided

  getStorage().then(async (storage) => {
    // Check minimum intent length
    const minLength = storage.minIntentLength || 3
    if (intent.length < minLength) {
      port.postMessage({ status: 'too_short' })
      return
    }

    // Always allow access - no more NLP checking
    console.log(`Intent received: "${intent}" - Access granted for ${whitelistTime} minutes!`)

    // add whitelist period for site
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const urls: string[] = tabs.map((x) => x.url)
      const domain: string = cleanDomain(urls)
      addToWhitelist(domain, whitelistTime)
    })

    // send status to tab
    port.postMessage({ status: 'ok' })
    console.log(`Success! Redirecting`)
  })
}

// handle keyboard shortcut - now toggles all active sites
listenForCommand(() => {
  getStorage().then((storage) => {
    const activeSites = storage.activeSites || []
    if (activeSites.length > 0) {
      // Turn off all active sites
      setStorage({ activeSites: [] }).then(() => {
        chrome.action.setIcon({ path: 'res/off.png' })
        reloadActive()
      })
    }
  })
}, () => {
  // No global "turn on" anymore - must be done per-site
})

