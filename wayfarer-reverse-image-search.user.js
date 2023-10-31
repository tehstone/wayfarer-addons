// ==UserScript==
// @name         Wayfarer Reverse Image Search
// @version      0.4.0
// @description  Add reverse image search links to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-reverse-image-search.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2023 tehstone, bilde
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
/* eslint indent: ['error', 2] */

(function() {
  /**
   * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
   */
  (function (open) {
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url == '/api/v1/vault/review') {
        if (method == 'GET') {
          this.addEventListener('load', () => checkResponse(this.response, checkReviewType), false);
        }
      }
      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

  const checkResponse = (response, callback) => {
    try {
      const json = JSON.parse(response);
      if (!json) return;
      if (json.captcha || !json.result) return;
      callback(json.result);
    } catch (e) {
      console.log(e); // eslint-disable-line no-console
    }
  }

  const awaitElement = get => new Promise((resolve, reject) => {
        let triesLeft = 10;
        const queryLoop = () => {
            const ref = get();
            if (ref) resolve(ref);
            else if (!triesLeft) reject();
            else setTimeout(queryLoop, 100);
            triesLeft--;
        }
        queryLoop();
    });

  const checkReviewType = result => awaitElement(() => (
        document.getElementById('check-duplicates-card') ||
        document.querySelector('app-review-photo')
    )).then(ref => {
        console.log("checkReviewType")
        switch (ref.tagName) {
            case 'WF-REVIEW-CARD':
                awaitElement(() => document.querySelector('#check-duplicates-card nia-map'))
                .then((ref) => {
                    addImageSearchLinks(ref, result);
                });
                break;
            case 'APP-REVIEW-PHOTO':
                awaitElement(() => ref.querySelector('.review-photo__info > div > div:nth-child(2)'))
                .then((ref) => {
                    addPhotoReviewLinks(ref, result);
                });
                break;
        }
    });

  const addImageSearchLinks = (before, data) => {
    const mainUrl = encodeURIComponent(`${data['imageUrl']}`);
    const mainSearchUrl = `https://lens.google.com/uploadbyurl?url=${mainUrl}`
    addLink(mainSearchUrl, 'app-photo-b.nomination-info-review-card > wf-review-card-b:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)');

    const supportingUrl = encodeURIComponent(`${data['supportingImageUrl']}`);
    const supportingSearchUrl = `https://lens.google.com/uploadbyurl?url=${supportingUrl}`
    addLink(supportingSearchUrl, 'app-supporting-info-b.nomination-info-review-card > wf-review-card-b:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)');
  }

  const addLink = (url, selector) => {
    console.log("addLink ")
    const insertBeforeEl = document.querySelector(selector);
    if (insertBeforeEl !== null && insertBeforeEl !== undefined) {
      const linkSpan = document.createElement('span');
      const link = document.createElement('a');
      link.href = url;
      link.target = 'wayfareropenin';
      link.textContent = 'Reverse Image Search';
      linkSpan.appendChild(link);
      insertAfter(linkSpan, insertBeforeEl);
    }
  }

  const addPhotoReviewLinks = (before, data) => {
    for (let i = 1; i < 27; i++) {
      const photoEl = document.querySelector(`app-photo-card.ng-star-inserted:nth-child(${i}) > div:nth-child(1) > div:nth-child(2)`);
      if (photoEl === null || photoEl === undefined) {
        break;
      }
      const url = encodeURIComponent(`${data['newPhotos'][i-1]['value']}`);
      console.log("here")
      const searchUrl = `https://lens.google.com/uploadbyurl?url=${url}`
      const linkSpan = document.createElement('span');
      const link = document.createElement('a');
      link.href = searchUrl;
      link.target = 'wayfareropenin';
      link.textContent = 'Reverse Image Search';
      //link.preventDefault();
      linkSpan.appendChild(link);
      photoEl.insertBefore(linkSpan, photoEl.children[0]);
    }
  }

  const insertAfter = (newNode, referenceNode) => {
      referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
  }

})();