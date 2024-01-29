// ==UserScript==
// @name         Wayfarer Prime Portal Links
// @version      0.1.0
// @description  Add links to open Showcase and Nearby portals in Ingress Prime
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-prime-portal-links.user.js
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

(function() {
	/**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (method == 'GET') {
                let callback = null;
                switch (url) {
                    case '/api/v1/vault/review':
                        callback = injectReview;
                        break;
                }
                if (callback) this.addEventListener('load', () => checkResponse(this.response, callback), false);
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

    const injectReview = result => awaitElement(() => (
        document.querySelector('app-should-be-wayspot') ||
        document.querySelector('app-review-edit') ||
        document.querySelector('app-review-photo')
    )).then(ref => {
        switch (ref.tagName) {
            case 'APP-SHOULD-BE-WAYSPOT':
                awaitElement(() => document.querySelector('#location-accuracy-card nia-map'))
                .then((ref) => {
                    addNearbyClickListeners();
                });
                break;
        }
    });

	const addOpenButtons = (before, portal) => {
		console.log(portal);
	}

    const addNearbyClickListeners = () => {
        awaitElement(() => document.querySelector('div.w-full'))
        .then(() => {
            document.querySelectorAll('img.cursor-pointer').forEach((el) => {
                el.addEventListener('click', (el) => {
                    const nearbyWaySpots = el.target.parentElement['__ngContext__'][23];
                    if (nearbyWaySpots !== null && nearbyWaySpots !== undefined) {
                        const output = nearbyWaySpots.filter(function(obj) {
                          return obj['infoWindowComponentData']['title'] === el.target.alt;
                        });
                        if (output.length === 1) {
                            const guid = output[0].id;
                            const lat = output[0].latitude;
                            const lng = output[0].longitude;
                            let nearbyBox = document.querySelector('.gm-style-iw-d > div:nth-child(1) > div:nth-child(1)');
                            if (nearbyBox !== null && nearbyBox !== undefined) {
                                const linkDiv = document.createElement('div');
                                linkDiv.classList.add('font-medium');
                                const link = document.createElement('a');
                                link.href = `https://link.ingress.com/?link=https%3a%2f%2fintel.ingress.com%2Fportal%2f${guid}&apn=com.nianticproject.ingress&isi=576505181&ibi=com.google.ingress&ifl=https%3a%2f%2fapps.apple.com%2fapp%2fingress%2fid576505181&ofl=https%3a%2f%2fintel.ingress.com%2fintel%3fpll%3d${lat}%2c${lng}`;
                                link.target = 'wayfareropenin';
                                link.textContent = el.target.alt;
                                linkDiv.appendChild(link);
                                nearbyBox.insertBefore(linkDiv, nearbyBox.children[0]);
                                nearbyBox.removeChild(nearbyBox.children[1]);
                            }
                        }
                    }
                });
            });
        });
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
})();