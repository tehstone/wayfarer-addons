// ==UserScript==
// @name         Wayfarer Nomination Status History
// @version      0.0.1
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
                            if (nominations[i]["isNianticControlled"] && !savedNominations[nid]["isNianticControlled"]) {
                                statusHistory.push({"timestamp": Date.now(), "status": "NIA_VOTING"});
                                createNotification(`${nominations[i]["title"]} went into Niantic review!`, "blue")
                            } else if (nominations[i]["status"] !== savedNominations[nid]["status"] &&
                                currentStatus !== "HELD" && savedNominations[nid]["status"] !== "HELD") {
                                let stateText;
                                let color = "red";
                                const currentStatus = nominations[i]["status"];
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
                                else {
                                    stateText = `: unknown status: ${nominations[i]["status"]}`;
                                }
                                savedNominations[nid]["status"] = nominations[i]["status"];
                                statusHistory.push({"timestamp": Date.now(), "status": nominations[i]["status"]});
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
        if (document.getElementById("wfnsNotify") === null) {
            let container = document.createElement("div");
            container.id = "wfnsNotify";
            document.getElementsByTagName("body")[0].appendChild(container);
        }
    }

    function createNotification(message, color = 'red'){
        let notification = document.createElement("div");
        switch (color) {
            case 'red':
                notification.setAttribute("class", "wfnsNotification wfnsBgRed");
                break;
            case 'green':
                notification.setAttribute("class", "wfnsNotification wfnsBgGreen");
                break;
            case 'blue':
                notification.setAttribute("class", "wfnsNotification wfnsBgBlue");
                break;
        }
        notification.onclick = function(){
            notification.remove();
        };

        let content = document.createElement("p");
        content.innerText = message;

        let closeButton = document.createElement("div");
        closeButton.innerText = "X";
        closeButton.setAttribute("class", "wfnsNotifyCloseButton");
        closeButton.setAttribute("style", "cursor: pointer;");

        notification.appendChild(closeButton);
        notification.appendChild(content);

        document.getElementById("wfnsNotify").appendChild(notification);
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
            #wfnsNotify{
                position: absolute;
                bottom: 1em;
                right: 1em;
                width: 30em;
                z-index: 100;
            }
            .wfnsNotification{
                border-radius: 0.5em;
                padding: 1em;
                margin-top: 1.5em;
                color: white;
            }
            .wfnsBgRed{
                background-color: #CC0000B0;
            }
            .wfnsBgGreen{
                background-color: #00CC00B0;
            }
            .wfnsBgBlue{
                background-color: #0000CCB0;
            }
            .wfnsNotifyCloseButton{
                float: right;
            }
            .wayfarernost {
                color: #333;
                margin-left: 2em;
                padding-top: 0.3em;
                text-align: center;
                display: block;
            }

            .dark .wayfarernost {
                color: #ddd;
            }

            .wayfarernost p:nth-child(2) {
                font-size: 20px;
                color: #20B8E3;
            }

            .wayfarernd {
                color: #333;
                margin: 20px 50px;
                padding: 20px 20px;
                text-align: left;
                font-size: 16px;
                background-color: #e5e5e5;
                border: 1px;
                border-radius: 3px;
                border-style: double;
                border-color: #ff4713;
                height: 25%
            }

            .wayfarerns__visible {
                display: block;
            }

            .dark .wayfarernd {
                color: #000000;
            }

            .wayfarerns__button {
                background-color: #e5e5e5;
                border: none;
                color: #ff4713;
                padding: 10px 10px;
                margin: 10px;
                text-align: center;
                text-decoration: none;
                display: inline-block;
                font-size: 16px;
            }

            .dark .wayfarerns__button {
                background-color: #404040;
                color: #20B8E3;
            }

            .wrap-collabsible {
                margin-bottom: 1.2rem;
            }

            #collapsible,
            #collapsed-stats {
                display: none;
            }

            .lbl-toggle-ns {
                display: block;
                font-weight: bold;
                font-family: monospace;
                font-size: 1.2rem;
                text-transform: uppercase;
                text-align: center;
                padding: 1rem;
                color: white;
                background: #DF471C;
                cursor: pointer;
                border-radius: 7px;
                transition: all 0.25s ease-out;
            }

            .lbl-toggle-ns:hover {
                color: lightgrey;
            }

            .lbl-toggle-ns::before {
                content: ' ';
                display: inline-block;
                border-top: 5px solid transparent;
                border-bottom: 5px solid transparent;
                border-left: 5px solid currentColor;
                vertical-align: middle;
                margin-right: .7rem;
                transform: translateY(-2px);
                transition: transform .2s ease-out;
            }

            .toggle {
                display:none;
            }

            .toggle:checked+.lbl-toggle-ns::before {
                transform: rotate(90deg) translateX(-3px);
            }

            .collapsible-content-ns {
                max-height: 0px;
                overflow: hidden;
                transition: max-height .25s ease-in-out;
            }

            .toggle:checked+.lbl-toggle-ns+.collapsible-content-ns {
                max-height: 9999999pt;
            }

            .toggle:checked+.lbl-toggle-ns {
                border-bottom-right-radius: 0;
                border-bottom-left-radius: 0;
            }

            .collapsible-content-ns .content-inner {
                border-bottom: 1px solid rgba(0, 0, 0, 1);
                border-left: 1px solid rgba(0, 0, 0, 1);
                border-right: 1px solid rgba(0, 0, 0, 1);
                border-bottom-left-radius: 7px;
                border-bottom-right-radius: 7px;
                padding: .5rem 1rem;
            }

            .content-inner td:last-child {
                text-align: right;
            }

            th,
            td {
                border: white solid 1pt;
                padding: 1pt 5pt;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }
}

init();

