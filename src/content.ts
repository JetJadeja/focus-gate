import BlobAnimation from './blob_animation'
import { getStorage, logIntentToStorage } from './storage'
import { cleanDomain } from './util'
import injectOptionsToOnboarding from './onboarding_options'

// some constants
const REFLECT_INFO: string = '#576ca8'
const REFLECT_ERR: string = '#ff4a47'
const REFLECT_ONBOARDING_URL: string = 'https://getreflect.app/onboarding/'
const DEV_REFLECT_ONBOARDING_URL: string = 'http://localhost:1313/onboarding/'

// as soon as page loads, check if we need to block it
checkIfBlocked()

// re-check page everytime this page gets focus again
window.addEventListener('focus', checkIfBlocked)

// check to see if the current website needs to be blocked
function checkIfBlocked(): void {
  // if onboarding, inject options to page
  if (
    window.location.href === REFLECT_ONBOARDING_URL ||
    window.location.href === DEV_REFLECT_ONBOARDING_URL
  ) {
    injectOptionsToOnboarding()
    return
  }

  // if overlay is already visible, don't need to re-block
  const overlay = document.getElementById('reflect-overlay')
  if (overlay && overlay.style.display !== 'none') {
    return
  }

  getStorage().then((storage) => {
    const strippedURL: string = getStrippedUrl()
    const exactURL: string = cleanDomain([window.location.href], true)

    // Check if this site is in activeSites (reflect is enabled for this site)
    const activeSites = storage.activeSites || []
    const isActive = activeSites.some((site: string) => {
      // if google.com is active, meet.google.com includes .google.com --> meet.google.com is not active
      // conversely if meet.google.com is active, google.com does not include meet.google.com --> google.com is not active
      return ((!strippedURL.includes(`.${site}`) && strippedURL.includes(site)) || exactURL === site)
    })

    if (isActive && !isWhitelistedWrapper()) {
      // This site is active, check if currently on whitelist
      iterWhitelist()
    }
  })
}

// display a message under intent entry field
function displayStatus(
  message: string,
  duration: number = 3000,
  colour: string = REFLECT_INFO
): void {
  $('#statusContent').css('color', colour)
  $('#statusContent').text(message)
  $('#statusContent').show().delay(duration).fadeOut()
}

// check to see if domain is whitelisted
function isWhitelistedWrapper(): boolean {
  const WHITELISTED_WRAPPERS: string[] = ['facebook.com/flx', 'l.facebook.com']
  return WHITELISTED_WRAPPERS.some((wrapper) => window.location.href.includes(wrapper))
}

// thin wrapper around util.ts/cleanDomain
function getStrippedUrl(): string {
  return cleanDomain([window.location.href])
}

function iterWhitelist(): void {
  // iterate whitelisted sites
  getStorage().then((storage) => {
    const strippedURL: string = getStrippedUrl()
    if (strippedURL === '') {
      return
    }

    // get dictionary of whitelisted sites
    const whitelist: { [key: string]: string } = storage.whitelistedSites

    // is current url whitelisted?
    if (!whitelist.hasOwnProperty(strippedURL)) {
      loadBlockPage()
      return
    }

    // check if whitelist period is expired
    const parsedDate: Date = new Date(whitelist[strippedURL])
    const currentDate: Date = new Date()
    const expired: boolean = currentDate >= parsedDate
    if (expired) {
      loadBlockPage()
      return
    }

    const timeDifference: number = parsedDate.getTime() - currentDate.getTime()
    // set timer to re-block page after whitelist period expires
    setTimeout(() => {
      loadBlockPage()
    }, timeDifference)
    
    // Hide overlay if we're within whitelist period
    hideOverlay()
  })
}

// Create fullscreen overlay with reflect block UI
function loadBlockPage(): void {
  const strippedURL: string = getStrippedUrl()
  const prompt_page_url: string = chrome.runtime.getURL('res/pages/prompt.html')
  const options_page_url: string = chrome.runtime.getURL('res/pages/options.html')

  // Check if overlay already exists
  const existingOverlay = document.getElementById('reflect-overlay')
  if (existingOverlay) {
    showOverlay()
    // Re-initialize in case the URL changed
    getStorage().then((storage) => {
      const options_page_url: string = chrome.runtime.getURL('res/pages/options.html')
      initializeOverlay(strippedURL, options_page_url, storage)
    })
    return
  }

  getStorage().then((storage) => {
    // get prompt page content
    $.get(prompt_page_url, (page) => {
      // Create overlay container
      const overlay = document.createElement('div')
      overlay.id = 'reflect-overlay'
      overlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 2147483647 !important;
        background: white !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      `
      
      // Insert the prompt content into overlay
      overlay.innerHTML = page
      document.body.appendChild(overlay)

      initializeOverlay(strippedURL, options_page_url, storage)
    })
  })
}

function showOverlay(): void {
  const overlay = document.getElementById('reflect-overlay')
  if (overlay) {
    overlay.style.display = 'flex'
    // Re-focus the input when showing overlay
    const textbox = document.getElementById('textbox') as HTMLInputElement
    if (textbox) {
      textbox.focus()
    }
    // Re-attach timing listeners in case they were lost
    setupTimingOptions()
  }
}

function hideOverlay(): void {
  const overlay = document.getElementById('reflect-overlay')
  if (overlay) {
    overlay.style.display = 'none'
    // Clear form when hiding
    const textbox = document.getElementById('textbox') as HTMLInputElement
    if (textbox) {
      textbox.value = ''
    }
    // Reset timing selection to default
    document.querySelectorAll('.timing-option').forEach(opt => opt.classList.remove('selected'))
    const defaultOption = document.querySelector('.timing-option[data-time="15"]')
    if (defaultOption) {
      defaultOption.classList.add('selected')
    }
  }
}

function initializeOverlay(strippedURL: string, options_page_url: string, storage: any): void {
  addFormListener(strippedURL)
  $('#linkToOptions').attr('href', options_page_url)
  
  if (storage.enableBlobs ?? true) {
    const anim = new BlobAnimation(storage.enable3D ?? true)
    anim.animate()
  }

  // modify custom message based on user input
  const welcome = document.getElementById('customMessageContent')
  welcome.textContent = storage.customMessage || 'hey! what are you here for?'
  
  // Focus the input
  const textbox = document.getElementById('textbox') as HTMLInputElement
  if (textbox) {
    textbox.focus()
  }
}

function addFormListener(strippedURL: string): void {
  const form: HTMLFormElement | null = document.forms.namedItem('inputForm')
  const button: HTMLElement | null = document.getElementById('submitButton')

  // Add timing option listeners
  setupTimingOptions()

  // add listener for form submit
  form?.addEventListener('submit', (event) => {
    // prevent default submit
    event.preventDefault()

    // Get selected time
    const selectedTime = getSelectedTime()
    if (selectedTime === 0) {
      displayStatus('please select a time duration', 3000, REFLECT_ERR)
      return
    }

    // change button to loading state
    button?.setAttribute('disabled', 'disabled')

    // extract entry
    const intentForm: HTMLFormElement | null = event.target as HTMLFormElement
    const intent: FormDataEntryValue = new FormData(intentForm).get('intent')
    const intentString: string = intent.toString()

    callBackgroundWithIntent(intentString, strippedURL, selectedTime)
  })
}

function setupTimingOptions(): void {
  const timingOptions = document.querySelectorAll('.timing-option:not(.custom-time)')
  const customTimeOption = document.querySelector('.custom-time') as HTMLElement
  const customTimeInput = document.getElementById('customTime') as HTMLInputElement

  // Default to 15 minutes
  const defaultOption = document.querySelector('.timing-option[data-time="15"]')
  if (defaultOption) {
    defaultOption.classList.add('selected')
  }

  timingOptions.forEach(option => {
    option.addEventListener('click', () => {
      // Remove selected from all
      document.querySelectorAll('.timing-option').forEach(opt => opt.classList.remove('selected'))
      // Add selected to clicked
      option.classList.add('selected')
    })
  })

  // Handle custom time
  customTimeInput.addEventListener('focus', () => {
    document.querySelectorAll('.timing-option').forEach(opt => opt.classList.remove('selected'))
    customTimeOption.classList.add('selected')
  })

  customTimeInput.addEventListener('input', () => {
    document.querySelectorAll('.timing-option').forEach(opt => opt.classList.remove('selected'))
    customTimeOption.classList.add('selected')
  })
}

function getSelectedTime(): number {
  const selected = document.querySelector('.timing-option.selected')
  if (!selected) return 0

  if (selected.classList.contains('custom-time')) {
    const customInput = document.getElementById('customTime') as HTMLInputElement
    const value = parseInt(customInput.value)
    return isNaN(value) || value < 1 ? 0 : Math.min(value, 1440) // Max 24 hours
  } else {
    const time = selected.getAttribute('data-time')
    return time ? parseInt(time) : 0
  }
}

function callBackgroundWithIntent(intent: string, url: string, whitelistTime: number): void {
  // open connection to runtime (background.ts)
  const port: chrome.runtime.Port = chrome.runtime.connect({
    name: 'intentStatus',
  })

  // send message then wait for response
  port.postMessage({ intent: intent, url: window.location.href, whitelistTime: whitelistTime })
  port.onMessage.addListener((msg) => {
    switch (msg.status) {
      case 'ok':
        // show success message
        displayStatus(`got it! ${whitelistTime} minutes starting now.`, 3000, REFLECT_INFO)
        setTimeout(() => {
          hideOverlay()
        }, 1000)
        break

      case 'too_short':
        invalidIntent('your response is a little short. be more specific!')
        break

      case 'invalid':
        invalidIntent("that doesn't seem to be productive. try being more specific.")
        break
    }

    // change button back to normal state
    const button: HTMLElement | null = document.getElementById('submitButton')
    button?.removeAttribute('disabled')

    const accepted: string = msg.status === 'ok' ? 'yes' : 'no'
    const intentDate: Date = new Date()
    logIntentToStorage(intent, intentDate, url, accepted, whitelistTime)

    // close connection
    port.disconnect()
  })
}

function invalidIntent(msg: string) {
  $('#inputFields').effect('shake', { times: 3, distance: 5 })
  displayStatus(msg, 3000, REFLECT_ERR)
  $('#textbox').val('')
}
