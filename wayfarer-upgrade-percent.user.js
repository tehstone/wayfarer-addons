// ==UserScript==
// @name         Wayfarer Upgrade Percentage
// @version      0.1.1
// @description  Add local review history storage to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-upgrade-percentage.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2024 tehstone
// This file is part of the Wayfarer Addons collection.

// This script is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This script is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You can find a copy of the GNU General Public License in the root
// directory of this script's GitHub repository: 
// <https://github.com/tehstone/wayfarer-addons/blob/main/LICENSE>
// If not, see <https://www.gnu.org/licenses/>.

/* eslint-env es6 */
/* eslint no-var: "error" */

function init() {
  let tryNumber = 10;
  let properties;
  let percentTextDiv = null;
  let rewardProgress = 0;

  /**
   * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
   */
  (function (open) {
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url == '/api/v1/vault/properties' && method == 'GET') {
        this.addEventListener('load', parseProps, false);
      }
      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

  (function (open) {
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url == '/api/v1/vault/review') {
        if (method == 'GET') {
          this.addEventListener('load', displayPercentage, false);
        }
      }
      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

  function parseProps(e) {
    tryNumber = 10;
    try {
      const response = this.response;
      const json = JSON.parse(response);
      if (!json) {
        console.log('Wayfarer Upgrade Percentage: Failed to parse response from Wayfarer');
        return;
      }
      // ignore if it's related to captchas
      if (json.captcha)
        return;

      properties = json.result;
      if (!properties) {
        console.log('Wayfarer Upgrade Percentage: Wayfarer\'s response didn\'t include a properties.');
        return;
      }
      checkPageStatus();

    } catch (e) {
      console.log(e); // eslint-disable-line no-console
    }
  }

  function checkPageStatus() {
    const ref = document.querySelector('wf-upgrade-visualization');
    if (!ref) {
      if (tryNumber === 0) {
        console.log('Wayfarer Upgrade Percentage:WF Percent Display initialization failed, please refresh the page');
        return;
      }
      setTimeout(checkPageStatus, 250);
      tryNumber--;
      return;
    }

    displayPercentage(ref);
  }

  function displayPercentage() {
    const ref = document.querySelector('wf-upgrade-visualization');
    const circleImage = ref.parentNode;
    const topRow = circleImage.parentNode;
    let container = document.createElement("div");
    container.classList.add("flex");
    container.classList.add("flex-row");
    if (percentTextDiv === null) {
      percentTextDiv = document.createElement("div");
    }
    percentTextDiv.style.margin = "auto";
    percentTextDiv.innerText = `${properties['rewardProgress']}%`;

    container.appendChild(circleImage);
    container.appendChild(percentTextDiv);
    topRow.appendChild(container);

    percentTextDiv.onclick = function() {
      var http = new XMLHttpRequest();
      var url = "https://wayfarer.nianticlabs.com/api/v1/vault/properties";
      http.open('GET', url, true);

      http.onreadystatechange = function() {//Call a function when the state changes.
          if(http.readyState == 4 && http.status == 200) {
            try {
              const json = JSON.parse(http.responseText);
              if (!json) {
                console.log('Wayfarer Upgrade Percentage:Failed to parse response from Wayfarer');
                return;
              }

              properties = json.result;
              if (properties) {
                percentTextDiv.innerText = `${properties['rewardProgress']}%`;
              }
            } catch (e) {}
          }
      }
    http.send();
  }
}

  function insertAfter(newNode, referenceNode) {
      referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
  }
}

init();
