// ==UserScript==
// @name         Wayfarer Nomination Streetview
// @version      0.3.8
// @description  Add Streetview to selected nomination
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-streetview.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2022 tehstone
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

(function() {
	let tryNumber = 10;
    const nomCache = {};
    let intelLink = null;

	/**
	 * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
	 */
	(function (open) {
		XMLHttpRequest.prototype.open = function (method, url) {
			if (url == '/api/v1/vault/manage' && method == 'GET') {
                this.addEventListener('load', parseNominations, false);
			}
			open.apply(this, arguments);
		};
	})(XMLHttpRequest.prototype.open);

    function parseNominations() {
        tryNumber = 10;
        const response = this.response;
        const json = JSON.parse(response);
        if (!json) {
            console.log('Failed to parse response from Wayfarer');
            return;
        }
        // ignore if it's related to captchas
        if (json.captcha) return;

        if (!json.result) {
            console.log('Wayfarer\'s response didn\'t include candidates.');
            return;
        }

        json.result.nominations.forEach(nomination => { nomCache[nomination.imageUrl] = nomination; })
        const list = document.getElementsByTagName('app-nominations-list')[0];
        list.addEventListener('click', handleNominationClick);
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

    function handleNominationClick(e) {
        awaitElement(() => e.target.closest('app-nominations-list-item'))
            .then((ref) => {
                const nom = nomCache[ref.querySelector('img').src];
                addStreetView(nom);
                addCoordinates(nom);
                setTimeout(() => {
                  document.querySelector('.wf-page-header__title > div:nth-child(1)').scrollIntoView();
                }, 500);
            });
    }

	function addCoordinates(selected) {
        const { lat, lng, city, state } = selected;
        awaitElement(() => document.querySelector("app-nominations app-details-pane p"))
            .then((locationP) => {
                const coordinates = `${lat},${lng}`;
                const newText = `${city} ${state} (${coordinates})`;
                locationP.innerText = newText;
                locationP.style.cursor = 'pointer';
                locationP.title = 'Copy coordinates to clipboard';
                locationP.onclick = function() {
                    navigator.clipboard.writeText(coordinates);
                }
            });

        awaitElement(() => document.querySelector("app-nominations app-details-pane h4"))
            .then((titleP) => {
                if (intelLink === null) {
                intelLink = document.createElement('a');
                intelLink.id = 'intelLink';
                intelLink.className = 'anchor-link';
                intelLink.target = "_blank";
                intelLink.title = 'Open in Intel';
                intelLink.style['font-size'] = "1.25rem";
            }

            intelLink.href = `https://intel.ingress.com/?ll=${lat},${lng}&z=16`;
            intelLink.innerText = titleP.innerText;
            
            insertAfter(intelLink, titleP);
            titleP.style.display = "none";
        });     
	}

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

	function addStreetView(selected) {
		if (typeof(google) === 'undefined') {
            setTimeout(addStreetView, 100, selected);
            return;
        }

        const ref = document.querySelector('wf-page-header');
		if (!ref) {
			if (tryNumber === 0) {
                alert('Nomination Street View initialization failed, please refresh the page');
				return;
			}
			setTimeout(addStreetView, 300, selected);
			tryNumber--;
			return;
		}

		if (document.getElementById("pano") === null){
            let lastPane = document.getElementsByClassName("details-pane__map")[0];
            if (lastPane === undefined){
                console.err("[WF-NSV] Failed to find attach elem");
                return;
            }
            let SVMapElement = document.createElement("div");
            SVMapElement.id = "pano";
            SVMapElement.style.height = "480px";
            SVMapElement.style.marginTop = "10px";
            lastPane.parentElement.insertBefore(SVMapElement, lastPane.nextSibling);
        }

        const { lat, lng, title } = selected;
        const SVMap = new google.maps.Map(document.getElementById("pano"), {
            center: { lat, lng },
            mapTypeId: "hybrid",
            zoom: 17,
            scaleControl: true,
            scrollwheel: true,
            gestureHandling: 'greedy',
            mapTypeControl: false
        });
        const marker = new google.maps.Marker({
            map: SVMap,
            position: { lat, lng },
            title
        });
        const client = new google.maps.StreetViewService;
        client.getPanoramaByLocation({ lat, lng }, 50, function(result, status) {
            if (status === "OK") {
                const nomLocation = new google.maps.LatLng(lat, lng);
                const svLocation = result.location.latLng;
                const heading = google.maps.geometry.spherical.computeHeading(svLocation, nomLocation);
                const panorama = SVMap.getStreetView();
                panorama.setPosition(svLocation);
                panorama.setPov({ heading, pitch: 0, zoom: 1 });
                panorama.setMotionTracking(false);
                panorama.setVisible(true);
            }
        });
	}
})();