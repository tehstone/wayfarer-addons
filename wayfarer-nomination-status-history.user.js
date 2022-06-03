// ==UserScript==
// @name         Wayfarer Nomination Status History
// @version      0.0.2
// @description  Track changes to nomination status
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-status-history.user.js
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

function init() {
    let tryNumber = 10;
    let db = null;
    let nominations;

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/manage') {
                if (method == 'GET') {
                    this.addEventListener('load', parseNominations, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function parseNominations(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.warn('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha)
                return;

            nominations = json.result.nominations;
            if (!nominations) {
                console.warn('Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            initDb();
            setTimeout(() => {
                addCss();
                addNotificationDiv();
                checkNominationChanges();
            }, 500);
            

        } catch (e)    {
            console.warn(e); // eslint-disable-line no-console
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

    function initDb() {
        (function() {
          'use strict';

          //check for support
          if (!('indexedDB' in window)) {
            console.log('This browser doesn\'t support IndexedDB');
            return;
          }

          const openRequest = indexedDB.open('wayfarer-tools-db', 3);

          openRequest.onsuccess = event => {
            db = event.target.result;
            console.log("------ db init complete ------");
          };

          openRequest.onupgradeneeded = (event) => {
            let db = event.target.result;
            if (!db.objectStoreNames.contains('nominationHistory')) {
              db.createObjectStore('nominationHistory', {keyPath: 'id'});
            }
          };

        })();
      }

    function checkNominationChanges() {
        const ref = document.querySelector('app-nominations-list');

        awaitElement(() => document.querySelector('app-nominations-list'))
            .then((ref) => {
                const loadFromDb = new Promise(async (resolve, reject) => {
                    if (db !== null) {
                        console.log("------ loading nominations ------");
                        const objectStore = db.transaction(['nominationHistory'], "readwrite").objectStore('nominationHistory');
                        const objectStoreAllNoms = objectStore.getAll();
                        objectStoreAllNoms.onsuccess = () => {
                            const savedNominationList = objectStoreAllNoms.result;
                            const savedNominations = {};
                            for (let i = 0; i < savedNominationList.length; i++) {
                                savedNominations[savedNominationList[i]["id"]] = savedNominationList[i];
                            }
                            resolve(savedNominations);
                        }
                    }
                })

                const states = ["ACCEPTED", "REJECTED", "VOTING", "DUPLICATE", "WITHDRAWN", "NOMINATED", "APPEALED", "NIANTIC_REVIEW", "HELD"];
                loadFromDb.then((savedNominations) => {
                    let objectStore = db.transaction(['nominationHistory'], "readwrite").objectStore('nominationHistory');
                    if (nominations.length < savedNominations.length) {
                        const missingcount = savedNominations.length - nominations.length;
                        createNotification(`${missingcount} nominations are missing from the list!`, "red");
                    }
                    let newCount = 0;
                    for (let i = 0; i < nominations.length; i++){
                        if (nominations[i]["id"] in savedNominations) {
                            const nid = nominations[i]["id"];
                            statusHistory = savedNominations[nid]["statusHistory"];
                            const currentStatus = nominations[i]["status"];
                            if (nominations[i]["isNianticControlled"] && !savedNominations[nid]["isNianticControlled"]) {
                                statusHistory.push({"timestamp": Date.now(), "status": "NIA_VOTING"});
                                createNotification(`${nominations[i]["title"]} went into Niantic review!`, "blue")
                            } else if (currentStatus !== savedNominations[nid]["status"] &&
                                currentStatus !== "HELD" && savedNominations[nid]["status"] !== "HELD") {
                                let stateText;
                                let color = "red";
                                if (currentStatus === "ACCEPTED") {
                                    stateText = "was accepted!";
                                    color = "green";
                                }
                                else if (currentStatus === "REJECTED") {
                                    stateText = "was rejected!";
                                }
                                else if (currentStatus === "DUPLICATE") {
                                    stateText = "was rejected as duplicate!";
                                }
                                else if (currentStatus === "VOTING") {
                                    stateText = "entered voting!";
                                    color = "gold";
                                }
                                else {
                                    stateText = `: unknown status: ${currentStatus}`;
                                }
                                savedNominations[nid]["status"] = currentStatus;
                                statusHistory.push({"timestamp": Date.now(), "status": currentStatus});
                                createNotification(`${nominations[i]["title"]} ${stateText}`, color);
                                
                            } else if (nominations[i]["upgraded"] && !savedNominations[nid]["upgraded"]) {
                                statusHistory.push({"timestamp": Date.now(), "status": "UPGRADED"});
                                createNotification(`${nominations[i]["title"]} was upgraded!`, "blue")
                            }
                            savedNominations[nid]["statusHistory"] = statusHistory;
                            objectStore = db.transaction(['nominationHistory'], "readwrite").objectStore('nominationHistory');
                            objectStore.put(savedNominations[nid]);
                        } else {
                            newCount += 1;
                            let statusHistory = [];
                            if (nominations[i]["status"] !== "NOMINATED") {
                                statusHistory.push({"timestamp": Date.now(), "status": nominations[i]["status"]});
                            }
                            const {id, type, day, nextUpgrade, upgraded, status, isNianticControlled, canAppeal, isClosed, canHold, canReleaseHold} = nominations[i];
                            const saveData = {
                                id,
                                type,
                                day,
                                nextUpgrade,
                                upgraded,
                                status,
                                isNianticControlled,
                                canAppeal,
                                isClosed,
                                canHold,
                                canReleaseHold,
                                statusHistory: statusHistory
                            };
                            if (db !== null) {
                                objectStore = db.transaction(['nominationHistory'], "readwrite").objectStore('nominationHistory');
                                objectStore.put(saveData);
                            }
                        }
                    }
                    if (newCount > 0) {
                        createNotification(`Found ${newCount} new nominations in the list!`, "green");
                    }

                    const upgradeNotifyChkbox = document.getElementById("wayfarernsupgradenotifychkbox");
                    if (upgradeNotifyChkbox) {
                        upgradeNotifyChkbox.checked = upgradeNotify === "true";
                        if (upgradeNotify) {
                            if (!nextUpgradeSet) {
                                createNotification("No Upgrade Next is set!");
                            }
                        }
                    }
                })
            });
    }

    function addNotificationDiv() {
        if (document.getElementById("wfnshNotify") === null) {
            let container = document.createElement("div");
            container.id = "wfnshNotify";
            document.getElementsByTagName("body")[0].appendChild(container);
        }
    }

    function createNotification(message, color = 'red'){
        let notification = document.createElement("div");
        switch (color) {
            case 'red':
                notification.setAttribute("class", "wfnshNotification wfnshBgRed");
                break;
            case 'green':
                notification.setAttribute("class", "wfnshNotification wfnshBgGreen");
                break;
            case 'blue':
                notification.setAttribute("class", "wfnshNotification wfnshBgBlue");
                break;
            case 'gold':
                notification.setAttribute("class", "wfnshNotification wfnshBgGold");
                break;
        }
        notification.onclick = function(){
            notification.remove();
        };

        let content = document.createElement("p");
        content.innerText = message;

        notification.appendChild(content);

        document.getElementById("wfnshNotify").appendChild(notification);
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

    function addCss() {
        const css = `
            #wfnshNotify{
                position: absolute;
                bottom: 1em;
                right: 1em;
                width: 30em;
                z-index: 100;
            }
            .wfnshNotification{
                font-weight: bold;
                border-radius: 1em;
                padding: 1em;
                margin-top: 1.5em;
                color: white;
            }
            .wfnshBgRed{
                background-color: #CC0000B0;
            }
            .wfnshBgGreen{
                background-color: #09b065;
            }
            .wfnshBgBlue{
                background-color: #1a3aad;
            }
            .wfnshBgGold{
                background-color: #f5da42;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }
}

init();

