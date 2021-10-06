// ==UserScript==
// @name         Wayfarer Keyboard Review
// @version      0.3.3
// @description  Add keyboard review to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-keyboard-review.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2021 tehstone
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
  let ratingElements = [];
  let revPosition = 0;
  let maxRevPosition = 6;
  let colCode = "20B8E3";
  let rejectDepth = 0;
  let rejectOuterIdx = 0;
  let menuPosition = {};
  let isReject = false;
  let isDuplicate = false;
  //let colCode = "DF471C";

  /**
   * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
   */
  (function (open) {
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url == '/api/v1/vault/review') {
        if (method == 'GET') {
          this.addEventListener('load', checkResponse, false);
        }
      }
      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

  function checkResponse(e) {
    try {
      const response = this.response;
      const json = JSON.parse(response);
      if (!json) {
        alert('Failed to parse response from Wayfarer');
        return;
      }
      // ignore if it's related to captchas
      if (json.captcha)
        return;

      candidate = json.result;
      if (!candidate) {
        alert('Wayfarer\'s response didn\'t include a candidate.');
        return;
      }
      addCss();
      initKeyboardCtrl();

    } catch (e) {
      console.log(e); // eslint-disable-line no-console
    }
  }

  function initKeyboardCtrl() {
    const ref = document.querySelector('app-should-be-wayspot');

    if (!ref) {
      if (tryNumber === 0) {
        document.querySelector('body')
          .insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Review History initialization failed, refresh page</strong></div>');
        tryNumber = 10;
        return;
      }
      setTimeout(initKeyboardCtrl, 1000);
      tryNumber--;
      return;
    }

    resetState();

    const ratingElementParts = document.getElementsByClassName("wf-review-card");
    if (ratingElementParts.length < 1) {
      setTimeout(initKeyboardCtrl, 200);
    }
    for (i = 0; i < ratingElementParts.length; i++) {
      if (i == 2 || i == 3 || i > 8) {
        continue;
      }
      ratingElements.push(ratingElementParts[i]);
    }
    
    ratingElements[0].setAttribute("style", "border-color: #" + colCode + ";");
    ratingElements[0].focus();
    ratingElements[0].scrollIntoView(false);
    document.addEventListener('keydown', keyDownEvent);

    const dupeContainer = document.getElementsByTagName("app-check-duplicates");
    if (dupeContainer.length > 0) {
      const dupeImages = dupeContainer[0].getElementsByClassName("cursor-pointer");
      if (dupeImages.length > 0) {
       dupeImages[0].click();
      }
    }
  }

  function keyDownEvent(e) {
    let suppress = false;
    if (['INPUT', 'TEXTAREA'].indexOf(document.activeElement.tagName) >= 0) {
      const card = document.activeElement.closest('wf-review-card');
      if (card && card.id == 'categorization-card') {
        if (e.keyCode >= 97 && e.keyCode <= 105) { // 1-9 Num pad
          suppress = handleCustomWhatIf(card, e.keyCode - 97);
        } else if (e.keyCode >= 49 && e.keyCode <= 57) { // 1-9 normal
          suppress = handleCustomWhatIf(card, e.keyCode - 49);
        } else if (e.keyCode === 13) { // Enter
          trySubmit(false);
        }
      } else if (isReject && e.keyCode === 27) { // escape
        cancelReject();
      } else if (isReject && e.keyCode === 13) { // 13
        submitReject(e);
      } else if (e.keyCode === 8) { // backspace
        backReject();
      }
    } else if (isDuplicate) {
      if (e.keyCode === 27) { // escape
        cancelDuplicate();
      } else if (e.keyCode === 13) { // 13
        submitDuplicate(e);
      }
    } else if (isReject) {
      if (e.keyCode >= 97 && e.keyCode <= 105) { // 1-5 Num pad
        handleRejectEntry(e, e.keyCode - 97);
      } else if (e.keyCode >= 49 && e.keyCode <= 57) { // 1-5 normal
        handleRejectEntry(e, e.keyCode - 49);
      } else if (e.keyCode === 27) { // escape
        cancelReject();
      } else if (e.keyCode === 8) { // backspace
        backReject();
      }
    } else {
      if (revPosition === 6) { // what is it? menu
        if (e.keyCode >= 97 && e.keyCode <= 99) { // 1-5 Num pad
          suppress = setRating(e.keyCode - 97, true);
          document.activeElement.blur();
        } else if (e.keyCode >= 49 && e.keyCode <= 51) { // 1-5 normal
          suppress = setRating(e.keyCode - 49, true);
          document.activeElement.blur();
        } else if (e.keyCode === 100 || e.keyCode === 52) {
          suppress = setRating(3, false);
        } else if (e.keyCode === 13) { // Enter
          trySubmit(false);
        }
      } else if (e.keyCode === 37 || e.keyCode === 8) { //Left arrow key or backspace
        suppress = updateRevPosition(-1, true);
      } else if (e.keyCode === 39) { //Right arrow key
        suppress = updateRevPosition(1, true);
      } else if (e.keyCode === 97 || e.keyCode === 49) {
        suppress = setRating(0, false);
        isReject = true;
        modifyRejectionPanel();
      } else if (e.keyCode >= 97 && e.keyCode <= 101) { // 1-5 Num pad
        suppress = setRating(e.keyCode - 97, true);
      } else if (e.keyCode >= 49 && e.keyCode <= 53) { // 1-5 normal
        suppress = setRating(e.keyCode - 49, true);
      } else if (e.keyCode === 13) { // Enter
        trySubmit(false);
      } else if (e.keyCode == 81) { // Q
        fullSizePhoto('app-should-be-wayspot');
      } else if (e.keyCode == 69) { // E
        fullSizePhoto('app-supporting-info');
      } else if (e.keyCode == 82) { // R
        zoomInOnMaps();
      } else if (e.keyCode == 70) { // F
        zoomOutOnMaps();
      } else if (e.keyCode == 68) { // Duplicate
        markDuplicate();
      }
    }
    if (suppress) e.preventDefault();
  }

  function setRating(rate, advance){
    starButtons = ratingElements[revPosition].getElementsByClassName("wf-rate__star");
    whatIsButtons = ratingElements[revPosition].querySelectorAll('.review-categorization > button');
    if (starButtons.length) {
      // Star rating
      starButtons[rate].click();
      if (advance) return updateRevPosition(1, false);
    } else if (whatIsButtons.length) {
      // What is it? (Required)
      whatIsButtons[rate].click();
      const wfinput = ratingElements[revPosition].querySelector('wf-select input');
      if (wfinput !== null) {
        wfinput.focus();
        wfinput.setActive();
      }
      return true;
    }
    return false;
  }

  function resetState() {
    tryNumber = 10;
    ratingElements = [];
    revPosition = 0;
    rejectDepth = 0;
    rejectOuterIdx = 0;
    menuPosition = {};
    isReject = false;
    isDuplicate = false;
  }

  function fullSizePhoto(container) {
    const closeX = document.getElementsByClassName("cdk-global-overlay-wrapper");
    if (closeX.length === 0) {
      const cont = document.getElementsByTagName(container)[0];
      const img = cont.querySelector('.wf-image-modal');
      img.click();
    } else {
      closeX[0].getElementsByTagName("button")[0].click()
    }
  }

  function zoomInOnMaps() {
    const btns = document.querySelectorAll('button[title="Zoom in"]');
    btns.forEach(e => e.click());
  }

  function zoomOutOnMaps() {
    const btns = document.querySelectorAll('button[title="Zoom out"]');
    btns.forEach(e => e.click());
  }

  function markDuplicate() {
    const btn = document.querySelector('button[class="wf-button wf-button--primary"]');
    if (btn !== null) {
      isDuplicate = true;
      btn.click()
    }
  }

  function cancelDuplicate() {
    const btn = document.querySelector('button[class="wf-button"]');
    if (btn !== null) {
      isDuplicate = false;
      btn.click()
    }
  }

  function submitDuplicate(e) {
    let btn = null;
    if (e.ctrlKey) {      
      btn = document.querySelector('button[class="wf-button mat-menu-trigger wf-split-button__toggle wf-button--primary"]');
    } else {
      btn = document.querySelector('button[class="wf-button wf-split-button__main wf-button--primary"]');
    }
    if (btn !== null) {
      isDuplicate = false;
      btn.click();
      setTimeout(submitToMenu, 250);
    }
  }

  function modifyRejectionPanel() {
    const ref = document.querySelector("app-review-rejection-abuse-modal");

    if (!ref) {
      setTimeout(modifyRejectionPanel, 250);
      return;
    }

    const els = document.getElementsByClassName("mat-expansion-panel");
    if (els.length > 0) {
      const first = els[0];
      const categories = first.children[1].children[0].children[0].children;
      for (let i = 0; i < categories.length; i++) {
        menuPosition[i] = {"children": {}};
        const text = categories[i].getElementsByTagName("mat-panel-title")[0].innerText;
        if (isNaN(text[0])) {
          const newText = i + 1 + ". " + text;
          categories[i].getElementsByTagName("mat-panel-title")[0].innerText = newText;
        }
        menuPosition[i]["element"] = categories[i];

        const childSelections = categories[i].getElementsByTagName("mat-list-option");
        for (let j = 0; j < childSelections.length; j++) {
          const text = childSelections[j].getElementsByClassName("mat-list-text")[0].innerText;
          if (isNaN(text[0])) {
            const newText = j + 1 + ". " + text;
            childSelections[j].getElementsByClassName("mat-list-text")[0].innerText = newText;
          }
          menuPosition[i]["children"][j] = {};
          menuPosition[i]["children"][j]["element"] = childSelections[j];
        }
      }
    }
  }

  function handleRejectEntry(e, idx) {
    if (rejectDepth === 0) {
      if (idx >= Object.keys(menuPosition).length) {
        return;
      }
      e.preventDefault();
      menuPosition[idx]["element"].children[0].click();
      rejectDepth = 1;
      rejectOuterIdx = idx;
    } else if (rejectDepth === 1) {
      if (idx >= Object.keys(menuPosition[rejectOuterIdx]["children"]).length) {
        return;
      }
      e.preventDefault();
      rejectDepth = 2;
      const headers = document.getElementsByClassName("mat-expansion-panel-header");
      if (headers.length > 0) {
        headers[0].click();
        document.activeElement.blur();
      }
      menuPosition[rejectOuterIdx]["children"][idx]["element"].children[0].click();
      const ref = document.querySelector("app-review-rejection-abuse-modal");
      const textWrapper = ref.getElementsByClassName("mat-form-field-infix");
      textWrapper[0].getElementsByTagName("textArea")[0].focus();
    } else {
      return;
    }
  }

  function backReject() {
    if (rejectDepth === 2) {
      const headers = document.getElementsByClassName("mat-expansion-panel-header");
      if (headers.length > 0) {
        headers[0].click();
        document.activeElement.blur();
      }
      rejectDepth = 1;
    } else if (rejectDepth === 1) {
      const expandedCats = document.querySelectorAll('[aria-expanded="true"]');
      if (expandedCats.length > 1) {
        expandedCats[1].click();
      }
      rejectDepth = 0;
    } else {
      cancelReject();
    }
  }

  function submitReject(e) {
    if (rejectDepth <= 1) {
      return;
    }
    if (e.shiftKey) {
      return;
    }
    let btn = null;
    if (e.ctrlKey) {      
      btn = document.querySelector('button[class="wf-button mat-menu-trigger wf-split-button__toggle wf-button--primary"]');
    } else {
      btn = document.querySelector('button[class="wf-button wf-split-button__main wf-button--primary"]');
    }
    if (btn !== null) {
      isReject = false;
      btn.click();
      setTimeout(submitToMenu, 250);
    }
  }

  function submitToMenu() {
    const btn = document.querySelector('button[role="menuitem"]');
    if (btn !== null) {
      btn.click();
    }
  }

  function cancelReject() {  
    const btn = document.querySelector('button[class="wf-button"]');
    if (btn !== null) {
      isReject = false;
      rejectDepth = 0;
      btn.click();
    }
  }

  function handleCustomWhatIf(card, idx) {
    const dropdown = card.querySelector('ng-dropdown-panel');
    const option = dropdown.querySelector(`#${dropdown.id}-${idx}`);
    if (option) option.click();
    //document.activeElement.blur();
    return true;
  }

  function updateRevPosition(diff, manual) {
    ratingElements[revPosition].setAttribute("style", "");
    revPosition += diff;
    if (revPosition < 0) {
      revPosition = 0;
    }
    if (revPosition > maxRevPosition) {
      revPosition = maxRevPosition;
    }

    ratingElements[revPosition].setAttribute("style", "border-color: #" + colCode + ";");
    ratingElements[revPosition].focus();
    ratingElements[revPosition].scrollIntoView(false);

    if (ratingElements[revPosition].id == 'categorization-card') {
      const wfinput = ratingElements[revPosition].querySelector('wf-select input');
      if (wfinput !== null) {
        wfinput.focus();
      }
      return true;
    }
    return false;
  }

  function trySubmit(finish) {
    const smartButton = document.querySelector('[aria-label="Smart Submit"]');
    if (smartButton === null || smartButton === undefined) {
      const submitWrapper = document.getElementsByTagName("app-submit-review-split-button");
      const buttonParts = submitWrapper[0].getElementsByTagName("button");
      if (finish) {
        buttonParts[1].click();
      } else {
        buttonParts[0].click();
      }
    } else {
      smartButton.firstElementChild.click();
    }
  }

  function addCss() {
    const whatIsSelector = 'div.review-categorization__option > div > div:nth-child(1)::before'
    const css = `
      ${whatIsSelector} { font-family: monospace; color: white; }
      div:nth-child(1) > ${whatIsSelector} { content: '[1] '; }
      div:nth-child(2) > ${whatIsSelector} { content: '[2] '; }
      div:nth-child(3) > ${whatIsSelector} { content: '[3] '; }
      div:nth-child(4) > ${whatIsSelector} { content: '[4] '; }
      div:nth-child(5) > ${whatIsSelector} { content: '[5] '; }
      div:nth-child(6) > ${whatIsSelector} { content: '[6] '; }
      div:nth-child(7) > ${whatIsSelector} { content: '[7] '; }
      div:nth-child(8) > ${whatIsSelector} { content: '[8] '; }
      div:nth-child(9) > ${whatIsSelector} { content: '[9] '; }

      div.review-categorization > button::before { color: white; margin-right: 5px; }
      div.review-categorization > button:nth-child(1)::before { content: '1. '; }
      div.review-categorization > button:nth-child(2)::before { content: '2. '; }
      div.review-categorization > button:nth-child(3)::before { content: '3. '; }
      div.review-categorization > button:nth-child(4)::before { content: '4. '; }
      div.review-categorization > button:nth-child(5)::before { content: '5. '; }
      div.review-categorization > button:last-child::before { margin-left: -14px; }
      `;
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    document.querySelector('head').appendChild(style);
  }

}

init();

