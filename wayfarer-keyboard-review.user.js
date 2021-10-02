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
    if (e.keyCode === 37 || e.keyCode === 8) { //Left arrow key or backspace
        updateRevPosition(-1, true);
    } else if (e.keyCode === 39) { //Right arrow key
        updateRevPosition(1, true);
    } 
    else if (e.keyCode >= 97 && e.keyCode <= 101) { // 1-5 Num pad
        setRating(e.keyCode - 97);
    } else if (e.keyCode >= 49 && e.keyCode <= 53) { // 1-5 normal
        setRating(e.keyCode - 49);
    }
  }

  function setRating(rate){
    starButtons = ratingElements[revPosition].getElementsByClassName("wf-rate__star");
    starButtons[rate].click();
    updateRevPosition(1, false);
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

