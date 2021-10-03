// ==UserScript==
// @name         Wayfarer Keyboard Review
// @version      0.1.0
// @description  Add keyboard review to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-keyboard-review.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */

function init() {
  let tryNumber = 10;
  let ratingElements = [];
  let revPosition = 0;
  let maxRevPosition = 5;
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
      // addCss();
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
      if (i == 2 || i == 3 || i > 7) {
        continue;
      }
      ratingElements.push(ratingElementParts[i]);
    }
    
    ratingElements[0].setAttribute("style", "border-color: #" + colCode + ";");
    ratingElements[0].focus();
    ratingElements[0].scrollIntoView(false);
    document.addEventListener('keydown', keyDownEvent);
  }

  function keyDownEvent(e) {
    if (isReject) {
      if (e.keyCode >= 97 && e.keyCode <= 101) { // 1-5 Num pad
        handleRejectEntry(e, e.keyCode - 97);
      } else if (e.keyCode >= 49 && e.keyCode <= 53) { // 1-5 normal
        handleRejectEntry(e, e.keyCode - 49);
      }
    } else {
      if (e.keyCode === 37 || e.keyCode === 8) { //Left arrow key or backspace
        updateRevPosition(-1, true);
      } else if (e.keyCode === 39) { //Right arrow key
        updateRevPosition(1, true);
      } else if (e.keyCode === 97 || e.keyCode === 49) {
        setRating(0, false);
        isReject = true;
        modifyRejectionPanel();
      } else if (e.keyCode >= 97 && e.keyCode <= 101) { // 1-5 Num pad
        setRating(e.keyCode - 97, true);
      } else if (e.keyCode >= 49 && e.keyCode <= 53) { // 1-5 normal
        setRating(e.keyCode - 49, true);
      } else if (e.keyCode === 13) { // Enter
        trySubmit(false);
      }
    }
  }

  function setRating(rate, advance){
    starButtons = ratingElements[revPosition].getElementsByClassName("wf-rate__star");
    starButtons[rate].click();
    if (advance) {
      updateRevPosition(1, false);
    }
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
      var a = 1;
      // "mat-expansion-panel-header"
      // "mat-list-option"
    }
  }

  function handleRejectEntry(e, idx) {
    e.preventDefault();
    if (rejectDepth === 0) {
      if (idx > Object.keys(menuPosition).length) {
        return;
      }
      menuPosition[idx]["element"].children[0].click();
      rejectDepth = 1;
      rejectOuterIdx = idx;
    } else {
      if (idx > Object.keys(menuPosition[rejectOuterIdx]["children"]).length) {
        return;
      }
      menuPosition[rejectOuterIdx]["children"][idx]["element"].children[0].click();
      const ref = document.querySelector("app-review-rejection-abuse-modal");
      const textWrapper = ref.getElementsByClassName("mat-form-field-infix");
      textWrapper[0].getElementsByTagName("textArea")[0].focus();
    }
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
    const css = `

      .wayfarerrh {
        color: #333;
        margin-left: 2em;
        padding-top: 0.3em;
        text-align: center;
        display: none;
      }

      .wayfarerrh__visible {
        display: block;
      }

      .dark .wayfarerrh {
        color: #ddd;
      }

      .wayfarerrh__button {
        background-color: #e5e5e5;
        border: none;
        color: #ff4713;
        padding: 4px 10px;
        margin: 1px;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        font-size: 16px;
      }

      .wayfarerrh__hiddendl {
        display: none;
      }
      `;
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    document.querySelector('head').appendChild(style);
  }

}

init();

