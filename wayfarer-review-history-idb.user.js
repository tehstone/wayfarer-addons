// ==UserScript==
// @name         Wayfarer Review History IDB
// @version      0.1.1
// @description  Add local review history storage to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-history-idb.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
// ==/UserScript==

// Copyright 2022 tehstone, bilde
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
        addRHButtons();
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

    const addRHButtons = () => awaitElement(() => document.querySelector('wf-logo')).then(ref => {
        console.log('ädding');
        if (document.getElementById('wfrh-idb-topbar')) return;
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
                anchor.setAttribute('href', url);
                anchor.setAttribute('download', `reviewHistory-${userHash}.json`);
                anchor.style.display = 'hidden';
                document.querySelector('body').appendChild(anchor);
                anchor.click();
                anchor.parentNode.removeChild(anchor);
            };
        }));
        outer.appendChild(label);
        outer.appendChild(exportBtn);
        ref.parentNode.parentNode.appendChild(outer);
    });

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
            margin-left: 2em;
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
