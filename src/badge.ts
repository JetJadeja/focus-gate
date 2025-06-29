// badge.ts is a module responsible for controlling the badge that displays whitelist time left
import { cleanDomain } from './util'
import { getStorage } from './storage'

// In service workers, we need to use chrome.alarms instead of setInterval
let badgeAlarmName = 'badgeUpdate'

export function setBadgeUpdate() {
  // Create an alarm that fires every second
  chrome.alarms.create(badgeAlarmName, { periodInMinutes: 1/60 })
  // Also run immediately
  badgeCountDown()
}

export function cleanupBadge(): void {
  chrome.alarms.clear(badgeAlarmName)
  chrome.action.setBadgeText({
    text: '',
  })
}

export function badgeCountDown(): void {
  // get current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const urls: string[] = tabs.map((x) => x.url)
    const domain: string = cleanDomain(urls)

    if (domain === '') {
      cleanupBadge()
      return
    }

    // get whitelisted sites
    getStorage().then((storage) => {
      if (storage.whitelistedSites.hasOwnProperty(domain)) {
        const expiry: Date = new Date(storage.whitelistedSites[domain])
        const currentDate: Date = new Date()
        const timeDifference: number = expiry.getTime() - currentDate.getTime()

        setBadge(timeDifference)
      } else {
        cleanupBadge()
      }
    })
  })
}

function setBadge(time: number) {
  time = Math.round(time / 1000)
  if (time <= 0) {
    cleanupBadge()
  } else {
    if (time > 60) {
      const min: number = Math.round(time / 60)
      chrome.action.setBadgeText({
        text: min.toString() + 'm',
      })
    } else {
      chrome.action.setBadgeText({
        text: time.toString() + 's',
      })
    }
  }
}
