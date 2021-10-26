// ==UserScript==
// @name         Wayfarer Compact Card Reviewing
// @version      0.1.0
// @description  Add compact card reviewing
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-compact-card.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
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
		};

        divNames.headerTop.children[0].children[0].children[1].style.display = "none";
		divNames.shouldBePortal.children[0].children[0].children[0].children[1].style.display = "none";
		divNames.supportingInfo.children[0].children[0].children[0].children[1].style.display = "none";

		var fragment = document.createDocumentFragment();
		let outer = document.createElement("div");
		outer.style.display = "flex";
		outer.style["flex-direction"] = "column";
		outer.appendChild(divNames.titleAndDescription);
		let threeCard = document.createElement("div");
		threeCard.style.height = "34%";
		threeCard.style.display = "flex";
		threeCard.style["flex-direction"] = "column";
		outer.appendChild(threeCard);
		fragment.appendChild(outer);
		insertAfter(fragment, divNames.shouldBePortal);
        document.querySelector('app-title-and-description .text-4xl').innerText.fontSize = "12pt";

        // Address changes
        // document.querySelector('app-should-be-wayspot .wf-image-modal ~ div').innerText.replace('Street', '');
        // document.querySelector('app-should-be-wayspot .wf-image-modal ~ div').innerText = "Somewhere in Australia";
        // document.querySelector('app-should-be-wayspot .wf-image-modal ~ div').style.display = "none";

        divNames.main.children[0].children[0].children[1].children[0].style.padding = "0pt";
        divNames.main.children[0].children[0].children[0].style.height = "50%";
        divNames.main.children[0].children[0].children[0].children[1].style.height = "69%";
        divNames.main.children[0].children[0].children[0].children[2].style.maxHeight = "41em";

        divNames.titleAndDescription.classList.remove("card--expand");
	    divNames.titleAndDescription.style.padding = "0pt";

	    divNames.titleAndDescription.children[0].children[0].children[0].children[0].innerText = "Title/Description";
        divNames.titleAndDescription.children[0].children[1].children[0].children[0].children[0].classList.remove("text-4xl");
        divNames.titleAndDescription.children[0].children[1].children[0].children[0].children[0].classList.add("text-3xl");
        divNames.titleAndDescription.children[0].children[1].children[0].children[1].classList.remove("text-lg");
        divNames.titleAndDescription.children[0].children[1].children[0].children[1].classList.add("text-base");
        divNames.titleAndDescription.children[0].children[0].children[0].children[1].style.display = "none";

	    divNames.titleAndDescription.children[0].children[0].children[0].children[0].style.margin = "0pt";
	    divNames.titleAndDescription.children[0].children[1].children[0].style.padding = "0pt";
	    divNames.titleAndDescription.getElementsByClassName("wf-rate")[0].style.marginBottom = "-0.6em";
	    divNames.titleAndDescription.getElementsByClassName("wf-rate")[0].style.marginTop = "-0.6em";

	    const titleHeader = divNames.titleAndDescription.children[0].children[0];
	    const titleBody = divNames.titleAndDescription.children[0].children[1];
	    const titleReview = divNames.titleAndDescription.children[0].children[2];
	    titleHeader.classList.remove("wf-review-card__header");
	    titleReview.classList.remove("wf-review-card__footer");
	    titleHeader.style.width = "50%";
	    titleReview.style.width = "50%";
	    let titleHeadBox = document.createElement("div");
	    titleHeadBox.style.display = "flex";
	    titleHeadBox.style["flex-direction"] = "row";
	    titleHeadBox.style.margin = "12pt 12pt 12pt 12pt";
	    titleHeadBox.appendChild(titleHeader);
	    titleHeadBox.appendChild(titleReview);
	    divNames.titleAndDescription.children[0].insertBefore(titleHeadBox, titleBody);

	    divNames.historicOrCultural.children[0].children[0].children[0].children[0].style.padding = "0pt";
	    divNames.historicOrCultural.children[0].children[0].children[0].children[0].style.margin = "5.5pt 0pt -1pt";
	    divNames.historicOrCultural.children[0].children[0].children[0].children[1].style.display = "none";
	    divNames.historicOrCultural.children[0].children[1].style.display = "none";
	    divNames.historicOrCultural.children[0].children[0].style.marginBottom = "-36pt";
	    divNames.historicOrCultural.children[0].children[0].style.marginTop = "-6pt";
	    
	    divNames.historicOrCultural.children[0].style.maxHeight = "4em";
	    divNames.visuallyUnique.children[0].children[0].children[0].children[0].style.padding = "0pt";
	    divNames.visuallyUnique.children[0].children[0].children[0].children[0].style.margin = "5.5pt 0pt -1pt";
	    divNames.visuallyUnique.children[0].children[0].children[0].children[1].style.display = "none";
	    divNames.visuallyUnique.children[0].children[1].style.display = "none";
	    divNames.visuallyUnique.children[0].children[0].style.marginBottom = "-36pt";
	    divNames.visuallyUnique.children[0].children[0].style.marginTop = "-6pt";
	    divNames.visuallyUnique.children[0].style.maxHeight = "4em";
	    divNames.safeAccess.children[0].children[0].children[0].children[0].style.padding = "0pt";
	    divNames.safeAccess.children[0].children[0].children[0].children[0].style.margin = "5.5pt 0pt -1pt";
	    divNames.safeAccess.children[0].children[0].children[0].children[1].style.display = "none";
	    divNames.safeAccess.children[0].children[1].style.display = "none";
	    divNames.safeAccess.children[0].children[0].style.marginBottom = "-36pt";
	    divNames.safeAccess.children[0].children[0].style.marginTop = "-6pt";
	    divNames.safeAccess.children[0].style.maxHeight = "4em";
        divNames.location.children[0].children[0].children[0].children[1].style.display = "none";
        divNames.whatIsIt.children[0].children[0].children[0].children[1].style.display = "none";

        // flavour text updates
	    divNames.historicOrCultural.children[0].children[0].children[0].children[0].innerText = "Significance";
        divNames.visuallyUnique.children[0].children[0].children[0].children[0].innerText = "Uniqueness";
        divNames.safeAccess.children[0].children[0].children[0].children[0].innerText = "Accessibility";

        divNames.titleAndDescription.children[0].style.maxHeight = "20em";

        divNames.historicOrCultural.children[0].style.margin = "6pt 0pt 0pt";
        divNames.visuallyUnique.children[0].style.margin = "6pt 0pt 6pt";

	    divNames.historicOrCultural.appendChild(divNames.visuallyUnique);

        divNames.supportingInfo.children[0].style.minHeight = "33.75em";
        divNames.supportingInfo.children[0].style.maxHeight = "33.75em";
        divNames.supportingInfo.children[0].children[1].children[0].children[1].classList.add("text-base");

	    threeCard.appendChild(divNames.historicOrCultural);
	    threeCard.appendChild(divNames.visuallyUnique);
	    threeCard.appendChild(divNames.safeAccess);

	    divNames.duplicates.appendChild(divNames.location);
        divNames.duplicates.style["flex-direction"] = "row";

	    divNames.duplicates.classList.add("card--expand");
        divNames.duplicates.style.display = "flex";
        divNames.duplicates.children[0].style.minWidth = "49%";
        divNames.duplicates.children[1].style.margin = "0pt 0pt 0pt 12pt";

	    divNames.location.classList.remove("card--double-width");
	    divNames.location.classList.add("card--expand");
        divNames.location.style.minWidth = "49%";

	    threeCard.style.order = 2;
	    divNames.titleAndDescription.style.order = 1;
	    divNames.historicOrCultural.style.order = 2;
	    divNames.visuallyUnique.style.order = 3;
	    divNames.safeAccess.style.order = 4;
	    divNames.whatIsIt.style.order = 7;

        divNames.main.children[0].children[0].children[1].children[1].remove();

        divNames.whatIsIt.appendChild(divNames.additionalComment);
        divNames.whatIsIt.style["flex-direction"] = "row";
	    divNames.whatIsIt.classList.remove("card--double-width");
        divNames.whatIsIt.classList.add("flex-full");
	    divNames.whatIsIt.classList.add("card--expand");
        divNames.whatIsIt.style.display = "flex";
        divNames.whatIsIt.children[0].style.minWidth = "49.65%";
        divNames.whatIsIt.children[1].style.margin = "0pt 0pt 0pt 12pt";
        divNames.whatIsIt.style.padding = "0pt";

	    divNames.additionalComment.classList.remove("card--double-width");
	    divNames.additionalComment.classList.add("card--expand");
        divNames.additionalComment.style.minWidth = "49.1%";
	}

	function insertAfter(newNode, referenceNode) {
	    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
	}
}

init();
