// ==UserScript==
// @name         Wayfarer Compact Card Reviewing
// @version      0.2.1
// @description  Add compact card reviewing
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-compact-card.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
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

// Special thanks to HaramDingo for adapting this file.

/* eslint-env es6 */
/* eslint no-var: "error" */

function init() {
	let tryNumber = 10;
    let settingsTryNumber = 10;
	let nominations;
    let candidate;

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
    XMLHttpRequest.prototype.open = function (method, url) {
        if (url == '/api/v1/vault/review' && method == 'GET') {
            this.addEventListener('load', parseCandidate, false);
        }
        open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function parseCandidate(e) {
        tryNumber = 10;
        settingsTryNumber = 10;
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
            checkPageType();

        } catch (e) {
            console.log(e); // eslint-disable-line no-console
        }
    }

    function checkPageType() {
        const ref = document.querySelector('app-should-be-wayspot') ||
                    document.querySelector('app-review-edit')

        if (!ref) {
            if (tryNumber === 0) {
               document.querySelector('body')
                  .insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Review History initialization failed, refresh page</strong></div>');
                return;
            }
            setTimeout(checkPageType, 500);
            tryNumber--;
            return;
        }
        applyUiMods();
    }

	function applyUiMods() {
		const ref = document.querySelector('app-should-be-wayspot');

		if (!ref) {
			if (tryNumber === 0) {
				document.querySelector('body')
					.insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Clippy Copy initialization failed, refresh page</strong></div>');
				return;
			}
			setTimeout(applyUiMods, 1000);
			tryNumber--;
			return;
		}

		const divNames = {
            main: document.querySelector('app-review-new'),
            headerTop: document.querySelector('wf-page-header'),
            sidebar: document.querySelector('app-sidebar'),
			shouldBePortal: document.querySelector('app-should-be-wayspot'),
			titleAndDescription: document.querySelector('app-title-and-description'),
			duplicates: document.querySelector('app-check-duplicates'),
			historicOrCultural: document.querySelector('app-historic-cultural-significance'),
			visuallyUnique: document.querySelector('app-visually-unique'),
			safeAccess: document.querySelector('app-safe-access'),
			location: document.querySelector('app-location-accuracy'),
			whatIsIt: document.querySelector('app-review-categorization'),
			additionalComment: document.querySelector('app-review-comments'),
			supportingInfo: document.querySelector('app-supporting-info'),
            submitButton: document.querySelector('app-submit-review-split-button')
		};

	divNames.historicOrCultural.children[0].children[0].children[0].children[1].style.display = "none";
	divNames.historicOrCultural.children[0].children[1].style.display = "none";
	divNames.visuallyUnique.children[0].children[0].children[0].children[1].style.display = "none";
	divNames.visuallyUnique.children[0].children[1].style.display = "none";
	divNames.safeAccess.children[0].children[0].children[0].children[1].style.display = "none";
	divNames.safeAccess.children[0].children[1].style.display = "none";


       // flavour text updates
        divNames.titleAndDescription.children[0].children[0].children[0].children[0].innerText = "Title/Description";
	divNames.historicOrCultural.children[0].children[0].children[0].children[0].innerText = "Significance";
        divNames.visuallyUnique.children[0].children[0].children[0].children[0].innerText = "Uniqueness";
        divNames.safeAccess.children[0].children[0].children[0].children[0].innerText = "Accessibility";

        // reduce size of text in box to condense essays
        divNames.titleAndDescription.children[0].children[1].children[0].children[0].children[0].classList.remove("text-4xl");
        divNames.titleAndDescription.children[0].children[1].children[0].children[0].children[0].classList.add("text-3xl");
        divNames.titleAndDescription.children[0].children[1].children[0].children[1].classList.remove("text-lg");
        divNames.titleAndDescription.children[0].children[1].children[0].children[1].classList.add("text-base");

        divNames.shouldBePortal.children[0].children[0].children[0].children[1].style.display = "none";
        document.querySelector('#location-accuracy-card .wf-review-card__body button.wf-button').textContent = 'Move Pin';
        divNames.titleAndDescription.children[0].children[0].children[0].children[1].style.display = "none";
        divNames.supportingInfo.children[0].children[0].children[0].children[1].style.display = "none";
        divNames.location.children[0].children[0].children[0].children[1].style.display = "none";
        divNames.whatIsIt.children[0].children[0].children[0].children[1].style.display = "none";

        // default for what is it is yes
        divNames.whatIsIt.children[0].children[1].children[0].children[0].children[1].children[0].click();
        divNames.whatIsIt.children[0].children[1].children[0].children[1].children[1].children[0].click();
        divNames.whatIsIt.children[0].children[1].children[0].children[2].children[1].children[0].click();

    }

	function insertAfter(newNode, referenceNode) {
	    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
	}
}

init();
