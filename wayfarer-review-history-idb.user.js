// ==UserScript==
// @name         Wayfarer Review History
// @version      0.4.3
// @description  Add local review history storage to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-history-idb.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
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

(() => {
    let userHash = 0;
    const OBJECT_STORE_NAME = 'reviewHistory';

    // https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
    const cyrb53 = function(str, seed = 0) {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
        h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1>>>0);
    };

    // Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
    (function (open) {
        XMLHttpRequest.prototype.open = function(method, url) {
            const args = this;
            if (url == '/api/v1/vault/review' && method == 'GET') {
                this.addEventListener('load', handleXHRResult(handleIncomingReview), false);
            } else if (url == '/api/v1/vault/properties' && method == 'GET') {
                // NOTE: Requires @run-at document-start.
                this.addEventListener('load', handleXHRResult(handleProfile), false);
            } else if (url == '/api/v1/vault/profile' && method == 'GET') {
                this.addEventListener('load', addRHButtons, false);
                this.addEventListener('load', addSettings, false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    // Overwrite the send method of the XMLHttpRequest.prototype to intercept POST data
    (function (send) {
        XMLHttpRequest.prototype.send = function(dataText) {
            try {
                const data = JSON.parse(dataText);
                const xhr = this;
                this.addEventListener('load', handleXHRResult(function(result) {
                    if (xhr.responseURL == window.origin + '/api/v1/vault/review') {
                        handleSubmittedReview(data, result).catch(console.error);
                    }
                }), false);
            } catch (err) { }
            send.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.send);

    // Perform validation on result to ensure the request was successful before it's processed further.
    // If validation passes, passes the result to callback function.
    const handleXHRResult = callback => function(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            if (!json.result) return;
            callback(json.result, e);
        } catch (err) {
            console.error(err);
        }
    };

    // Get a user ID to properly handle browsers shared between several users. Store a hash only, for privacy.
    const handleProfile = ({ socialProfile }) => {
        if (socialProfile.email) userHash = cyrb53(socialProfile.email);
    };

    const handleIncomingReview = result => new Promise((resolve, reject) => {
        let saveColumns = [];
        const common = ['type', 'id', 'title', 'description', 'lat', 'lng'];
        switch (result.type) {
            case 'NEW':
                saveColumns = [...common, 'imageUrl', 'statement', 'supportingImageUrl'];
                break;
            case 'EDIT':
                saveColumns = [...common, 'descriptionEdits', 'titleEdits', 'locationEdits'];
                break;
            case 'PHOTO':
                saveColumns = [...common, 'newPhotos'];
                break;
        }
        if (saveColumns.length) {
            const saveData = { ...filterObject(result, saveColumns), ts: Date.now(), userHash, review: null };
            getIDBInstance().then(db => {
                const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
                tx.oncomplete = event => { db.close(); resolve(); };
                tx.onerror = reject;
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                objectStore.put(saveData);
                tx.commit();
            }).catch(reject);
        } else {
            reject('Unknown review type: ' + result.type);
        }
    });

    const handleSubmittedReview = (review, response) => new Promise((resolve, reject) => {
        if (response === 'api.review.post.accepted' && review.hasOwnProperty('id')) {
            getIDBInstance().then(db => {
                const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
                tx.oncomplete = event => { db.close(); resolve(); };
                tx.onerror = reject;
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                const getReview = objectStore.get(review.id);
                getReview.onsuccess = () => {
                    const { result } = getReview;
                    objectStore.put({ ...result, review });
                    tx.commit();
                };
                getReview.onerror = reject;
            }).catch(reject);
        }
    });

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

    if (!unsafeWindow.wft_plugins_api) unsafeWindow.wft_plugins_api = {};
    unsafeWindow.wft_plugins_api.reviewHistory = {
        getAll: () => new Promise((resolve, reject) => getIDBInstance().then(db => {
            const tx = db.transaction([OBJECT_STORE_NAME], 'readonly');
            tx.oncomplete = event => db.close();
            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
            const getAllReviews = objectStore.getAll();
            getAllReviews.onsuccess = () => {
                const { result } = getAllReviews;
                resolve(result);
            };
        }))
    };

    const addRHButtons = () => awaitElement(() => document.querySelector('wf-rating-bar')).then(ref => {
        const outer = document.createElement('div');
        outer.id = 'wfrh-idb-topbar';
        outer.classList.add('wfrh-idb');
        const label = document.createElement('p');
        label.textContent = 'Review history:';
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export';
        exportBtn.addEventListener('click', () => getIDBInstance().then(db => {
            const tx = db.transaction([OBJECT_STORE_NAME], 'readonly');
            tx.oncomplete = event => db.close();
            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
            const getAllReviews = objectStore.getAll();
            getAllReviews.onsuccess = () => {
                const { result } = getAllReviews;
                const toSave = [];
                for (let i = 0; i < result.length; i++) {
                    if (result[i].userHash == userHash) {
                        toSave.push({ ...result[i], userHash: undefined });
                    }
                }
                const blob = new Blob([JSON.stringify(toSave)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.setAttribute('download', `reviewHistory-${userHash}.json`);
                anchor.href = url;
                anchor.setAttribute('target', '_blank');
                anchor.click();
                URL.revokeObjectURL(url);
            };
        }));

        const importBtn = document.createElement('button');
        importBtn.textContent = 'Import';
        importBtn.addEventListener('click', () => {
            if (confirm('Importing will overwrite all currently stored data, are you sure you want to clear your currently saved review history?')) {
            getIDBInstance().then(db => {
                let data;
                let input = document.createElement('input');
                input.type = 'file';
                input.onchange = (event) => {
                    const reader = new FileReader();

                    reader.onload = function(event) {
                        const clearReviewHistory = new Promise((resolve, reject) => {
                            const tx = db.transaction([OBJECT_STORE_NAME], 'readwrite');
                            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                            objectStore.clear();
                            let imported = 0;
                            let failed = 0;
                            let filtered = 0;
                            try {
                                data = JSON.parse(event.target.result);
                                for (let i = 0; i < data.length; i++) {
                                    let found = false;
                                    if (!("id" in data[i])) {
                                        if ("review" in data[i]) {
                                            if (data[i].review !== false && data[i].review != "skipped") {
                                                if ("id" in data[i].review) {
                                                    data[i].id = data[i].review.id;
                                                    found = true;
                                                    if (applyFilters(data[i])) {
                                                        objectStore.put(data[i]);
                                                        imported += 1;
                                                    } else {
                                                        filtered += 1;

                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        found = true;
                                        if (applyFilters(data[i])) {
                                            objectStore.put(data[i]);
                                            imported += 1;
                                        } else {
                                            filtered += 1;
                                        }
                                    }
                                    if (!found) {
                                        failed += 1
                                    }
                                }
                            } catch (error) {
                                tx.abort();
                                reject(error);
                            }
                            tx.commit();
                            resolve([imported, failed, filtered]);
                        });

                        clearReviewHistory.then((result) => {
                            let alertText = `Cleared all saved review history.\nImported ${result[0]} review history item(s).`;
                            if (result[2] > 0) {
                                alertText += `\nFiltered ${result[2]} item(s) from import.`;
                            }
                            if (result[1] > 0) {
                                alertText += `\nFailed to import ${result[1]} item(s).`;
                            }
                            db.close();
                            alert(alertText);
                            location.reload();
                        }).catch((error) => {
                            db.close();
                            alert(`Failed to import data with error:\n${error}`);
                            location.reload();
                        })
                    }
                    reader.readAsText(event.target.files[0]);
                }
                input.click();
            }
        )}});

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => getIDBInstance().then(db => {
            if (confirm('Are you sure you want to clear your review history?')) {
                const tx = db.transaction([OBJECT_STORE_NAME], 'readwrite');
                tx.oncomplete = event => db.close();
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                const clearReviewHistory = objectStore.clear();
                clearReviewHistory.onsuccess = () => {
                    alert("Cleared all saved review history.");
                    location.reload();
                }
            }
        }));

        outer.appendChild(label);
        outer.appendChild(exportBtn);
        outer.appendChild(importBtn);
        outer.appendChild(clearBtn);
        ref.parentNode.appendChild(outer);
    });

    function applyFilters(review) {
        const userId = getUserId();
        console.log("here")
        let dateAfter = localStorage["wfrh_date_after" + userId];
        if (dateAfter === undefined || dateAfter === null || dateAfter === "" || dateAfter === "false") {
            dateAfter = 0;
        } else {
            dateAfter = new Date(dateAfter);
        }
        if (dateAfter !== 0) {
            if (review['ts'] < dateAfter.getTime()) {
                return false;
            }
        }

        let location = localStorage["wfrh_location_" + userId];
        if (location === undefined || location === null || location === "" || location === "false"){
            location = "0,0";
        }
        let range = localStorage["wfrh_range_" + userId];
        if (range === undefined || range === null || range === "" || range === "false" || range === "0"){
            range = 0;
        }

        if (location !== "0,0" && range !== 0) {
            const centerLocation = location.split(",");
            if (centerLocation.length == 2) {
                const reviewDistance = haversineDistance([parseInt(centerLocation[0]), parseInt(centerLocation[1])], [review["lat"], review["lng"]]);
                if (reviewDistance > range) {
                    return false;
                }
            }
        }

        return true;
    }

    function haversineDistance(coords1, coords2) {
        function toRad(x) {
            return x * Math.PI / 180;
        }

        let lat1 = coords1[0];
        let lon1 = coords1[1];

        let lat2 = coords2[0];
        let lon2 = coords2[1];
        let R = 6371; // km

        let x1 = lat2 - lat1;
        let dLat = toRad(x1);
        let x2 = lon2 - lon1;
        let dLon = toRad(x2)
        let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        let d = R * c;

        // returns in kilometers
        return d;
    }

    const addSettings = () => awaitElement(() =>document.querySelector('wf-rating-bar')).then(ref => {
        let settingsDiv = document.getElementById("profileSettings");
        if (settingsDiv === null) {
            settingsDiv = document.createElement('div');
            settingsDiv.id = "profileSettings";
            settingsDiv.classList.add('wayfarerrh__visible');

            const settingsContainer = document.createElement('div');
            settingsContainer.setAttribute('class', 'wrap-collabsible')
            settingsContainer.id = "nomStats";

            const collapsibleInput = document.createElement("input");
            collapsibleInput.id = "collapsed-settings";
            collapsibleInput.setAttribute("class", "toggle");
            collapsibleInput.type = "checkbox";

            const collapsibleLabel = document.createElement("label");
            collapsibleLabel.setAttribute("class", "lbl-toggle-es");
            collapsibleLabel.innerText = "Settings";
            collapsibleLabel.setAttribute("for", "collapsed-settings");

            const collapsibleContent = document.createElement("div");
            collapsibleContent.setAttribute("class", "collapsible-content-es");

            collapsibleContent.appendChild(settingsDiv);
            settingsContainer.appendChild(collapsibleInput);
            settingsContainer.appendChild(collapsibleLabel);
            settingsContainer.appendChild(collapsibleContent);

            const ratingNarRef = document.querySelector('wf-rating-bar');
            const container = ratingNarRef.parentNode.parentNode;
            container.appendChild(settingsContainer);
        }


        const sectionLabel = document.createElement("label");
        sectionLabel.innerText = "Review History Import Settings";
        sectionLabel.classList.add('wayfarerrh__bold');

        let dateInput = document.createElement('input');
        dateInput.setAttribute("type", "date");
        const userId = getUserId();
        console.log("here")
        let dateAfter = localStorage["wfrh_date_after" + userId];
        if (dateAfter === undefined || dateAfter === null || dateAfter === "" || dateAfter === "false") {
            dateAfter = 0;
            dateInput.value = dateAfter;
        } else {
            dateAfter = new Date(dateAfter);
            dateInput.valueAsDate = dateAfter;
        }
        
        dateInput.addEventListener('change', function () {
            const userId = getUserId();
            dateAfter = new Date(this.value);
            localStorage["wfrh_date_after" + userId] = dateAfter;
        });
        dateInput.id = "wayfarerrhdateafter";
        dateInput.classList.add('wayfarercc_date_input');

        const dateAfterLabel = document.createElement("label");
        dateAfterLabel.innerText = "Import After Date:";
        dateAfterLabel.setAttribute("for", "wayfarerrhdateafter");
        dateAfterLabel.classList.add('wayfareres_settings_label');
        dateAfterLabel.title = "Any reviews in the import file prior to the selected date will not be imported.."

        let locationInput = document.createElement('input');
        let location = localStorage["wfrh_location_" + userId];
        if (location === undefined || location === null || location === "" || location === "false"){
            location = "0,0";
        }
        locationInput.value = location;
        locationInput.addEventListener('change', function () {
            const userId = getUserId();
            location = this.value;
            localStorage["wfrh_location_" + userId] = location;
        });
        locationInput.id = "wayfarerrhlocation";
        locationInput.classList.add('wayfarercc_gps_input');

        const locationLabel = document.createElement("label");
        locationLabel.innerText = "Filter Location Center:";
        locationLabel.setAttribute("for", "wayfarerrhlocation");
        locationLabel.classList.add('wayfareres_settings_label');
        locationLabel.title = "If location and range are set, displayed values will be filtered to those within the given number of kilometers to the location provided."

        let rangeInput = document.createElement('input');
        rangeInput.setAttribute("type", "number");
        rangeInput.setAttribute("size", '4');
        let range = localStorage["wfrh_range_" + userId];
        if (range === undefined || range === null || range === "" || range === "false"){
            range = 0;
        }
        rangeInput.value = range;
        rangeInput.addEventListener('change', function () {
            const userId = getUserId();
            range = this.value;
            localStorage["wfrh_range_" + userId] = range;
        });
        rangeInput.id = "wayfarerrhlocation";
        rangeInput.classList.add('wayfarercc_input');

        const rangeLabel = document.createElement("label");
        rangeLabel.innerText = "Filter Location Range:";
        rangeLabel.setAttribute("for", "wayfarerrhlocation");
        rangeLabel.classList.add('wayfareres_settings_label');
        rangeLabel.title = "If location and range are set, displayed values will be filtered to those within the given number of kilometers to the location provided."
        

        settingsDiv.appendChild(sectionLabel);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(dateAfterLabel);
        settingsDiv.appendChild(dateInput);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(locationLabel);
        settingsDiv.appendChild(locationInput);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(rangeLabel);
        settingsDiv.appendChild(rangeInput);
        settingsDiv.appendChild(document.createElement('br'));
    })

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    function getUserId() {
        var els = document.getElementsByTagName("image");
        for (var i = 0; i < els.length; i++) {
           const element = els[i];
           const attribute = element.getAttribute("href");
           let fields = attribute.split('/');
           let userId = fields[fields.length-1];
           fields = userId.split('=');
           userId = fields[0];
           return userId;
        }
        return "temporary_default_userid";
    }

    // Returns an copy of obj containing only the keys specified in the keys array.
    const filterObject = (obj, keys) => Object
        .keys(obj)
        .filter(key => keys.includes(key))
        .reduce((nObj, key) => { nObj[key] = obj[key]; return nObj; }, {});

    // Opens an IDB database connection.
    // IT IS YOUR RESPONSIBILITY TO CLOSE THE RETURNED DATABASE CONNECTION WHEN YOU ARE DONE WITH IT.
    // THIS FUNCTION DOES NOT DO THIS FOR YOU - YOU HAVE TO CALL db.close()!
    const getIDBInstance = version => new Promise((resolve, reject) => {
        'use strict';

        if (!window.indexedDB) {
            reject('This browser doesn\'t support IndexedDB!');
            return;
        }

        const openRequest = indexedDB.open('wayfarer-tools-db', version);
        openRequest.onsuccess = event => {
            const db = event.target.result;
            const dbVer = db.version;
            console.log(`IndexedDB initialization complete (database version ${dbVer}).`);
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                db.close();
                console.log(`Database does not contain column ${OBJECT_STORE_NAME}. Closing and incrementing version.`);
                getIDBInstance(dbVer + 1).then(resolve);
            } else {
                resolve(db);
            }
        };
        openRequest.onupgradeneeded = event => {
            console.log('Upgrading database...');
            const db = event.target.result;
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                db.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'id' });
            }
        };
    });

    (() => {
        const css = `
        .wfrh-idb {
            color: #333;
            padding-top: 0.3em;
            text-align: center;
            display: block;
        }

        .dark .wfrh-idb {
            color: #ddd;
        }

        .wfrh-idb button {
            background-color: #e5e5e5;
            border: none;
            color: #ff4713;
            padding: 2px 6px;
            margin: 3px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 14px;
        }

        .dark .wfrh-idb button {
            background-color: #404040;
            color: #20B8E3;
        }

        .wayfarerrh__bold {
            margin:  2px 12px;
            padding: 2px 12px;
            font-size: 1.1em;
            font-weight: bold;
            color: black;
        }

        .wayfarercc_date_input {
            margin:  2px 12px;
            padding: 2px 12px;
            width: 180px;
            background-color: #FFFFFF;
            color: black;
        }

        .wayfarercc_gps_input {
            margin:  2px 12px;
            padding: 2px 12px;
            width: 250px;
            background-color: #FFFFFF;
            color: black;
        }

        .wayfarercc_input {
            margin:  2px 12px;
            padding: 2px 12px;
            background-color: #FFFFFF;
            color: black;
        }

        .wayfareres_settings_label {
            margin:  2px 12px;
            padding: 2px 12px;
            color: black;
            font-size: 16px;
        }
        `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        // We're loading this script on document-start, which means <head> does not exist yet.
        // Wait for it to start existing before we try to add the CSS to it.
        const tryAdd = setInterval(() => {
            const head = document.querySelector('head');
            if (head) {
                clearInterval(tryAdd);
                console.log('Injecting styles...');
                head.appendChild(style);
            }
        }, 100);
    })();
})();
