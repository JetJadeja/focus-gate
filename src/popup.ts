import { getStorage, setStorage, addToBlocked } from './storage'
import { cleanDomain, getElementFromForm } from './util'
import { Intent } from './types'

const ENTER_KEY_CODE = 13

// when popup is loaded, setup event listeners
document.addEventListener('DOMContentLoaded', () => {
  initializeTabs()
  initializeCurrentSite()
  initializeOptions()
  drawFilterListTable()
  drawIntentListTable()
  setAddButtonListener()
})

function initializeTabs() {
  const tabs = document.querySelectorAll('.tab-button')
  const contents = document.querySelectorAll('.tab-content')
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'))
      contents.forEach(c => c.classList.remove('active'))
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active')
      const tabName = tab.getAttribute('data-tab')
      document.getElementById(`${tabName}-tab`).classList.add('active')
    })
  })
}

function initializeCurrentSite() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const urls: string[] = tabs.map((x) => x.url)
    const domain: string = cleanDomain(urls)
    const url: string = cleanDomain(urls, true)

    // not on a page (probably new tab)
    if (domain === '') {
      document.getElementById('curDomain').textContent = 'none.';
      (document.getElementById('reflect-toggle') as HTMLElement).style.display = 'none';
      (document.querySelector('.button-con') as HTMLElement).style.display = 'none';
      return
    }

    document.getElementById('curDomain').textContent = domain

    // Get current state and set appropriately
    getStorage().then((storage) => {
      const activeSites = storage.activeSites || []
      const isActive = activeSites.includes(domain) || activeSites.includes(url)
      
      // Setup toggle for current site
      const toggleSwitch: HTMLInputElement = document.querySelector('#reflect-toggle') as HTMLInputElement
      toggleSwitch.checked = isActive
      toggleSwitch.addEventListener('change', (e) => toggleSiteState(e, domain), false)
    })
  })
}

function initializeOptions() {
  // update threshold display value
  const slider = document.getElementById('thresholdSlider') as HTMLInputElement
  const display = document.getElementById('thresholdSliderValue')

  const sliderToValue = (slider) => `${Math.round(+slider.value * 100)}%`
  slider.oninput = () => {
    display.innerHTML = sliderToValue(slider)
  }

  // set state of page based off of storage
  getStorage().then((storage) => {
    getElementFromForm('numIntentEntries').value = storage.numIntentEntries
    getElementFromForm('minIntentLength').value = storage.minIntentLength ?? 3
    getElementFromForm('customMessage').value = storage.customMessage || ''
    getElementFromForm('enableBlobs').checked = storage.enableBlobs ?? true
    getElementFromForm('enable3D').checked = storage.enable3D ?? true
    getElementFromForm('thresholdSlider').value = storage.predictionThreshold || 0.5
    display.innerHTML = sliderToValue(slider)
  })

  // options listeners
  document.getElementById('save').addEventListener('click', saveCurrentOptions)
}

// function to toggle reflect for current site
function toggleSiteState(e, domain: string) {
  getStorage().then((storage) => {
    let activeSites = storage.activeSites || []
    let blockedSites = storage.blockedSites || []
    
    if (e.target.checked) {
      // Enable reflect for this site
      if (!activeSites.includes(domain)) {
        activeSites.push(domain)
      }
      // Also add to blocked sites if not already there
      if (!blockedSites.includes(domain)) {
        blockedSites.push(domain)
      }
    } else {
      // Disable reflect for this site
      activeSites = activeSites.filter(site => site !== domain)
      // Optionally remove from blocked sites too
      blockedSites = blockedSites.filter(site => site !== domain)
    }
    
    setStorage({ activeSites, blockedSites }).then(() => {
      // Update icon based on whether any sites are active
      const hasActiveSites = activeSites.length > 0
      chrome.action.setIcon({ 
        path: hasActiveSites ? 'res/on.png' : 'res/off.png' 
      })
      
      // Reload the page to apply changes
      chrome.tabs.reload()
    })
  })
}



function saveCurrentOptions(): void {
  // get all form values
  const numIntentEntries: number = getElementFromForm('numIntentEntries').value
  const minIntentLength: number = getElementFromForm('minIntentLength').value
  const customMessage: string = getElementFromForm('customMessage').value
  const enableBlobs: boolean = getElementFromForm('enableBlobs').checked
  const enable3D: boolean = getElementFromForm('enable3D').checked
  const predictionThreshold: number = getElementFromForm('thresholdSlider').value

  setStorage({
    numIntentEntries: numIntentEntries,
    customMessage: customMessage,
    enableBlobs: enableBlobs,
    enable3D: enable3D,
    predictionThreshold: predictionThreshold,
    minIntentLength: minIntentLength,
  }).then(() => {
    // Update status to let user know options were saved.
    const status = document.getElementById('statusContent')
    status.textContent = 'saved.'
    setTimeout(() => {
      status.textContent = ''
    }, 1500)
  })
}

function updateButtonListeners(): void {
  // get all buttons
  const buttons = document.querySelectorAll('.remove-site')
  buttons.forEach((button: HTMLButtonElement) => {
    button.addEventListener('click', () => {
      // get url
      const url: string = button.getAttribute('data-site')

      // get storage
      getStorage().then((storage) => {
        let activeSites: string[] = storage.activeSites || []
        let blockedSites: string[] = storage.blockedSites || []

        // remove from both lists
        activeSites = activeSites.filter(site => site !== url)
        blockedSites = blockedSites.filter(site => site !== url)

        // sync with chrome storage
        setStorage({ activeSites, blockedSites }).then(() => {
          console.log(`removed ${url} from lists`)
          drawFilterListTable()
          
          // Update icon if no sites are active
          if (activeSites.length === 0) {
            chrome.action.setIcon({ path: 'res/off.png' })
          }
        })
      })
    })
  })
}

function updateSiteToggleListeners(): void {
  const toggles = document.querySelectorAll('.site-toggle')
  toggles.forEach((toggle: HTMLInputElement) => {
    toggle.addEventListener('change', (e) => {
      const site = toggle.getAttribute('data-site')
      const isChecked = (e.target as HTMLInputElement).checked
      
      getStorage().then((storage) => {
        let activeSites = storage.activeSites || []
        
        if (isChecked) {
          if (!activeSites.includes(site)) {
            activeSites.push(site)
          }
        } else {
          activeSites = activeSites.filter(s => s !== site)
        }
        
        setStorage({ activeSites }).then(() => {
          // Update icon based on whether any sites are active
          const hasActiveSites = activeSites.length > 0
          chrome.action.setIcon({ 
            path: hasActiveSites ? 'res/on.png' : 'res/off.png' 
          })
        })
      })
    })
  })
}

function generateWebsiteDiv(id: number, site: string, isActive: boolean): string {
  return `<tr>
    <td style="width: 70%"><p class="urlDisplay">${site}</p></td>
    <td style="width: 15%">
      <input class='site-toggle toggle' id='site-toggle-${id}' type='checkbox' ${isActive ? 'checked' : ''} data-site="${site}">
      <label class='toggle-button' for='site-toggle-${id}'></label>
    </td>
    <td style="width: 15%"><button class="remove-site" data-id="${id}" data-site="${site}">&times;</button></td>
    </tr>`
}

function generateIntentDiv(
  id: number,
  intentData: Intent,
  date: Date
): string {
  // reformatting date to only include month, date, and 12 hour time
  const formattedDate: string = date.toLocaleDateString('default', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  })

  // creating display table for intents and dates
  return `<tr>
      <td style="width: 20%"><p class="intentDisplay">${intentData.url}</p></td>
      <td style="width: 35%"><p class="intentDisplay">${intentData.intent}</p></td>
      <td style="width: 10%"><p class="intentDisplay">${intentData.accepted || 'n/a'}</p></td>
      <td style="width: 20%"><p class="intentDisplay">${formattedDate}</p></td>
      <td style="width: 15%"><p class="intentDisplay">${intentData.whitelistTime ? intentData.whitelistTime + ' min' : '-'}</p></td>
    </tr>`
}

function drawFilterListTable(): void {
  getStorage().then((storage) => {
    const blockedSites: string[] = storage.blockedSites || []
    const activeSites: string[] = storage.activeSites || []

    // Show all active sites (not just blocked ones)
    const allSites = Array.from(new Set(activeSites))

    // appending row for each site
    const tableContent: string = allSites.reduce((table, site, cur_id) => {
      const isActive = activeSites.includes(site)
      table += generateWebsiteDiv(cur_id, site, isActive)
      return table
    }, '')
    // generates new line in table for new intent
    const table: string = tableContent ? `<table class="hover shadow styled">${tableContent}</table>` : '<p class="empty-state">no sites added yet.</p>'

    // adds table to html
    const filterList: HTMLElement = document.getElementById('filterList')
    if (filterList != null) {
      filterList.innerHTML = table
    }
    // adding listeners
    updateButtonListeners()
    updateSiteToggleListeners()
  })
}

function drawIntentListTable(): void {
  getStorage().then((storage) => {
    const intentList: { [key: string]: Intent } = storage.intentList

    if (!intentList || Object.keys(intentList).length === 0) {
      const previousIntents: HTMLElement = document.getElementById('previousIntents')
      if (previousIntents != null) {
        previousIntents.innerHTML = '<p class="empty-state">no intents recorded yet.</p>'
      }
      return
    }

    // generate table element
    let table: string = `<table class="hover shadow styled intent-table">
        <tr>
        <th style="width: 20%">url</th>
        <th style="width: 35%">intent</th>
        <th style="width: 10%">ok?</th>
        <th style="width: 20%">date</th>
        <th style="width: 15%">time</th>
      </tr>`

    let cur_id: number = 0
    // iter dates in intentList
    for (const rawDate in intentList) {
      // if number of entries is less than max
      if (cur_id < storage.numIntentEntries) {
        // parse fields from intentlist[rawDate]
        const date: Date = new Date(rawDate)
        const intentData: Intent = intentList[rawDate]

        // append table row with this info
        table += generateIntentDiv(cur_id, intentData, date)
        cur_id++
      }
    }
    // generates new line in table for new intent
    table += '</table>'

    // insert table into html
    const previousIntents: HTMLElement = document.getElementById('previousIntents')
    if (previousIntents != null) {
      previousIntents.innerHTML = table
    }
  })
}

// sets event listeners for add new url operations
function setAddButtonListener(): void {
  const urlInputElement: HTMLElement = document.getElementById('urlInput')

  // add key listener to submit new url on <ENTER> pressed
  urlInputElement.addEventListener('keypress', (event) => {
    if (event.keyCode === ENTER_KEY_CODE) {
      addUrlToFilterList()
    }
  })

  // add click listener to add URL button
  const addButton: HTMLElement = document.getElementById('add')
  addButton.addEventListener('click', () => {
    addUrlToFilterList()
  })
}

function addUrlToFilterList(): void {
  // get urlInput
  const urlInput: HTMLFormElement = document.getElementById('urlInput') as HTMLFormElement

  // see if value is non-empty
  if (urlInput.value !== '') {
    const url: string = urlInput.value
    const cleanUrl = cleanDomain([url], true) === '' ? url : cleanDomain([url], true)
    
    getStorage().then((storage) => {
      let activeSites = storage.activeSites || []
      let blockedSites = storage.blockedSites || []
      
      // Add to active sites
      if (!activeSites.includes(cleanUrl)) {
        activeSites.push(cleanUrl)
      }
      
      // Also add to blocked sites for compatibility
      if (!blockedSites.includes(cleanUrl)) {
        blockedSites.push(cleanUrl)
      }
      
      setStorage({ activeSites, blockedSites }).then(() => {
        urlInput.value = ''
        drawFilterListTable()
        
        // Update icon since we now have active sites
        chrome.action.setIcon({ path: 'res/on.png' })
      })
    })
  }
}