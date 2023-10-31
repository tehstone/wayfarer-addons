// ==UserScript==
// @name         Wayfarer Review Timer
// @version      0.5.0
// @description  Add review timer to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-timer.user.js
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

(function() {
    let tryNumber = 10;
    let expireTime = null;
    let userId = null;
    let submitPopup = null;
    let checkTimer = null;
    let rejectCheckTimer = null;
    let dupeModalCheckTimer = null;
    let submitButtonClicked = false;

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/review' && method == 'GET') {
                this.addEventListener('load', injectTimer, false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

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

    function injectTimer() {
        submitButtonClicked = false;
        tryNumber = 10;
        awaitElement(() => document.querySelector('wf-logo'))
            .then((ref) => {
                try {
                    const response = this.response;
                    const json = JSON.parse(response);
                    if (!json) return;
                    const candidate = json.result;
                    if (json.captcha || !candidate) return;

                    expireTime = candidate.expires;
                    initTimer(ref.parentNode.parentNode, candidate.expires);
                } catch (e) {
                    console.log(e);
                }
                addSettings();
                //addSmartSubmitButton();
            });
    }

    function initTimer(container, expiry) {
        awaitElement(() => (
            document.getElementById('appropriate-card')  ||
            document.querySelector('app-review-edit') ||
            document.querySelector('app-review-photo')
            )).then(ref => {
                let counter = document.getElementById("wayfarerrtmr_counter");
                if (!counter) {
                    const div = document.createElement('div');
                    div.className = 'wayfarerrtmr';

                    let countLabel = document.createElement('p');
                    countLabel.id = "wayfarerrtmr_counterlabel";
                    countLabel.textContent = 'Time remaining: ';
                    counter = document.createElement('p');
                    counter.id = "wayfarerrtmr_counter"
                    counter.classList.add("wftmr_counter");
                    
                    div.appendChild(countLabel);
                    div.appendChild(counter);
                    container.appendChild(div);

                    let timer = setInterval(() => {
                        updateTime(counter, expiry);
                    }, 1000);

                } else {
                    counter.style.display = 'block';
                }
            });
    }

    function updateTime(counter, expiry) {
        let diff = Math.ceil((expiry - new Date().getTime()) / 1000);
        if (diff < 0) {
            counter.textContent = "Expired";
            return;
        }
        let minutes = Math.floor(diff / 60);
        let seconds = Math.abs(diff % 60);
        if (minutes < 10) minutes = `0${minutes}`;
        if (seconds < 10) seconds = `0${seconds}`;
        counter.textContent = `${minutes}:${seconds}`;
    }

    function addSettings() {
        awaitElement(() => document.querySelector("body > app-root > app-wayfarer > div > mat-sidenav-container > mat-sidenav-content > div > app-review > div.flex.justify-center.mt-8.ng-star-inserted"))
            .then((ref) => {
                userId = getUserId();

                let settingsDiv = document.getElementById("wayfarerrtsettings");
                if (!settingsDiv) {
                    settingsDiv = document.createElement('div');
                    settingsDiv.id = "wayfarerrtsettings";
                    settingsDiv.classList.add('wayfarerrh__visible');

                    const settingsContainer = document.createElement('div');
                    settingsContainer.setAttribute('class', 'wrap-collabsible')
                    settingsContainer.id = "settingsContainer";

                    const collapsibleInput = document.createElement("input");
                    collapsibleInput.id = "collapsedSettings";
                    collapsibleInput.setAttribute("class", "toggle");
                    collapsibleInput.type = "checkbox";

                    const collapsibleLabel = document.createElement("label");
                    collapsibleLabel.setAttribute("class", "lbl-toggle-es");
                    collapsibleLabel.innerText = "Add-on Settings";
                    collapsibleLabel.setAttribute("for", "collapsedSettings");

                    const collapsibleContent = document.createElement("div");
                    collapsibleContent.setAttribute("class", "collapsible-content-es");

                    collapsibleContent.appendChild(settingsDiv);
                    settingsContainer.appendChild(collapsibleInput);
                    settingsContainer.appendChild(collapsibleLabel);
                    settingsContainer.appendChild(collapsibleContent);
                    insertAfter(settingsContainer, ref);
                }

                let smartSubmitEnabledInput = document.createElement('input');
                smartSubmitEnabledInput.setAttribute("type", "checkbox");
                let smartSubmitEnabled = localStorage["wfrt_smart_submit_enabled_" + userId];
                if (smartSubmitEnabled === undefined || smartSubmitEnabled === null || smartSubmitEnabled === ""){
                    smartSubmitEnabled = false;
                }
                smartSubmitEnabledInput.checked = smartSubmitEnabled === "true";
                smartSubmitEnabledInput.addEventListener('change', function () {
                    smartSubmitEnabled = this.checked;
                    localStorage["wfrt_smart_submit_enabled_" + userId] = smartSubmitEnabled;
                });
                smartSubmitEnabledInput.id = "wayfarerrtsmartsubmitenabled";
                smartSubmitEnabledInput.classList.add('wayfarercc_input');

                const smartSubmitEnabledLabel = document.createElement("label");
                smartSubmitEnabledLabel.innerText = "Enable Smart Submit:";
                smartSubmitEnabledLabel.setAttribute("for", "wayfarerrtsmartsubmitenabled");
                smartSubmitEnabledLabel.classList.add('wayfareres_settings_label');

                let minDelayInput = document.createElement('input');
                minDelayInput.setAttribute("type", "number");
                minDelayInput.setAttribute("size", '2');
                let minDelay = localStorage["wfrt_min_delay_" + userId];
                if (minDelay === undefined || minDelay === null || minDelay === "false"){
                    minDelay = 20;
                    localStorage["wfrt_min_delay_" + userId] = minDelay;
                }
                if (minDelay === "") {
                    minDelay = 0;
                }
                minDelayInput.value = minDelay;
                minDelayInput.addEventListener('change', function () {
                    minDelay = this.value;
                    localStorage["wfrt_min_delay_" + userId] = minDelay;
                });
                minDelayInput.id = "wayfarerrtmindelay";
                minDelayInput.classList.add('wayfarercc_input');

                const minDelayLabel = document.createElement("label");
                minDelayLabel.innerText = "Smart Submit Minimum Delay:";
                minDelayLabel.setAttribute("for", "wayfarerrtmindelay");
                minDelayLabel.classList.add('wayfareres_settings_label');

                let maxDelayInput = document.createElement('input');
                maxDelayInput.setAttribute("type", "number");
                maxDelayInput.setAttribute("size", '2');
                let maxDelay = localStorage["wfrt_max_delay_" + userId];
                if (maxDelay === undefined || maxDelay === null || maxDelay === "false"){
                    maxDelay = 30;
                    localStorage["wfrt_max_delay_" + userId] = maxDelay;
                }
                if (maxDelay === "") {
                    maxDelay = 0;
                }
                maxDelayInput.value = maxDelay;
                maxDelayInput.addEventListener('change', function () {
                    maxDelay = this.value;
                    localStorage["wfrt_max_delay_" + userId] = maxDelay;
                });
                maxDelayInput.id = "wayfarerrtmaxdelay";
                maxDelayInput.classList.add('wayfarercc_input');

                const maxDelayLabel = document.createElement("label");
                maxDelayLabel.innerText = "Smart Submit Maximum Delay:";
                maxDelayLabel.setAttribute("for", "wayfarerrtmaxdelay");
                maxDelayLabel.classList.add('wayfareres_settings_label');

                settingsDiv.appendChild(smartSubmitEnabledLabel);
                settingsDiv.appendChild(smartSubmitEnabledInput);
                settingsDiv.appendChild(document.createElement('br'));
                settingsDiv.appendChild(minDelayLabel);
                settingsDiv.appendChild(minDelayInput);
                settingsDiv.appendChild(document.createElement('br'));
                settingsDiv.appendChild(maxDelayLabel);
                settingsDiv.appendChild(maxDelayInput);
                settingsDiv.classList.add('wayfarerrh__visible');
            });
    }

    function addSmartSubmitButton() {
        const buttons = document.getElementsByClassName("wf-split-button");

        if (buttons.length < 1) {
            setTimeout(addSmartSubmitButton, 400);
            return;
        }

        userId = getUserId();
        let smartSubmitEnabled = localStorage["wfrt_smart_submit_enabled_" + userId];
        if (smartSubmitEnabled === undefined || smartSubmitEnabled === null || smartSubmitEnabled === ""){
            smartSubmitEnabled = false;
        } else {
            smartSubmitEnabled = smartSubmitEnabled === "true";
        }        

        const new_review_ref = document.querySelector('#safety-and-accessability-card');
        if (new_review_ref) {
            smartSubmitEnabled = false;
        }
        

        if (smartSubmitEnabled !== true) {
            return;
        }

        for(let i=0; i < buttons.length; i++) {
            let smartSubmitButton = document.getElementById(`wayfarerrtssbutton_${i}`);

            if (!smartSubmitEnabled) {
                if (smartSubmitButton !== null) {
                    smartSubmitButton.style.display = "none";
                }
                return;
            }

            if (smartSubmitButton === null) {
                smartSubmitButton = document.createElement("button");
                smartSubmitButton.className = 'wf-button wf-split-button__main wf-button--primary wfrt-smart-button';
                smartSubmitButton.disabled = true;
                smartSubmitButton.id = `wayfarerrtssbutton_${i}`;
                smartSubmitButton.innerHTML = "Smart Submit";
                smartSubmitButton.onclick = checkSubmitReview;
            }
			const submitButton = buttons[i].firstElementChild;
			insertAfter(smartSubmitButton, submitButton);
			submitButton.style.display = 'none';
        }

        document.body.addEventListener('rejectionDialogOpened', addButtonToRejectDialog, true);

        const rejectStar = document.querySelector('.wf-review-card .wf-rate__star');
        if (rejectStar) {
            rejectStar.onclick = function() {
                setTimeout(addButtonToRejectDialog, 500);
            };
        }

        addSubmitButtonObserver();

        dupeModalCheckTimer = setInterval(() => {
            const dupeModal = document.getElementsByTagName("app-confirm-duplicate-modal");
            if (dupeModal.length < 1) {
                return;
            }
            const parent = document.getElementsByClassName("mat-dialog-actions");
            let smartSubmitButton = document.getElementById(`wayfarerrtssbutton_d`);
            if (smartSubmitButton === null) {
                const buttons = parent[0].getElementsByTagName('button');
                smartSubmitButton = document.createElement("button");
                smartSubmitButton.className = 'wf-button wf-split-button__main wf-button--primary wfrt-smart-button';
                smartSubmitButton.style.marginLeft = "1.5rem";
                smartSubmitButton.id = `wayfarerrtssbutton_d`;
                smartSubmitButton.innerHTML = "Smart Submit";
                smartSubmitButton.onclick = function() {
                    checkSubmitReview();
                }
                insertAfter(smartSubmitButton, buttons[1]);

                buttons[1].style.display = "none";
            }

            clearInterval(this);
        }, 500);
    }

    function addSubmitButtonObserver() {
        const buttonWrapper = document.getElementsByTagName("wf-split-button");
        if (buttonWrapper.length < 1) {
            setTimeout(addSubmitButtonObserver, 250);
            return;
        }

        const button = buttonWrapper[0].querySelector('button.wf-button--primary');
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type == 'attributes' && mutation.attributeName == 'disabled') {
                    for(let i=0; i < buttonWrapper.length;i++) {
                        let smartButton = document.getElementById(`wayfarerrtssbutton_${i}`);
                        smartButton.disabled = button.disabled;
                        smartButton.classList.toggle('wf-button--disabled', button.disabled);
                        smartButton.classList.toggle('wf-button--primary', !button.disabled);
                    }
                }
            });
        });

        observer.observe(button, {
            attributes: true,
			attributeFilter: ['disabled']
        });
    }

    function addButtonToRejectDialog() {
        const parent = document.getElementsByClassName("mat-dialog-actions");
        if (parent.length < 1) {
            return;
        }
        const buttons = parent[0].getElementsByTagName('button');
        let smartSubmitButton = document.getElementById(`wayfarerrtssbutton_r`);
        if (smartSubmitButton === null) {
            smartSubmitButton = document.createElement("button");
            smartSubmitButton.className = 'wf-button wf-split-button__main wf-button--disabled';
            smartSubmitButton.disabled = true;
            smartSubmitButton.style.marginLeft = "1.5rem";
            smartSubmitButton.id = `wayfarerrtssbutton_r`;
            smartSubmitButton.innerHTML = "Smart Submit";
            smartSubmitButton.onclick = function() {
                checkSubmitReview();
            }
            insertAfter(smartSubmitButton, buttons[1]);

            buttons[1].style.display = "none";
        }

        addRejectButtonObserver(buttons[1]);
    }

    function addRejectButtonObserver(button) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type == 'attributes' && mutation.attributeName == 'disabled') {
                    let smartButton = document.getElementById(`wayfarerrtssbutton_r`);
                    smartButton.disabled = button.disabled;
                    smartButton.classList.toggle('wf-button--disabled', button.disabled);
                    smartButton.classList.toggle('wf-button--primary', !button.disabled);
                }
            });
        });

        observer.observe(button, {
            attributes: true,
            attributeFilter: ['disabled']
        });
    }

    function checkSubmitReview() {
        if (submitButtonClicked) { return; }
        submitButtonClicked = true;
        let diff = Math.ceil((expireTime - new Date().getTime()) / 1000);

        let minDelay = localStorage["wfrt_min_delay_" + userId];
        if (minDelay === undefined || minDelay === null || minDelay === "" || minDelay === "false"){
            minDelay = 20;
        }

        let maxDelay = localStorage["wfrt_max_delay_" + userId];
        if (maxDelay === undefined || maxDelay === null || maxDelay === "" || maxDelay === "false"){
            maxDelay = 20;
        }

        let delay = randomIntFromInterval(parseInt(minDelay), parseInt(maxDelay));
        if (diff + delay > 1200) {
            updateButtonText(`Submitting in ${Math.abs(1200 - delay - diff)}`, `${Math.abs(1200 - delay - diff)}`);
        }
        waitToSubmit(delay);
    }

    function waitToSubmit(delay) {
        let diff = Math.ceil((expireTime - new Date().getTime()) / 1000);
        if (diff + delay < 1200) {
            btn = document.querySelector('button[class="wf-button wf-split-button__main wf-button--primary"]');
            btn.click();
        } else {
            updateButtonText(`Submitting in ${Math.abs(1200 - delay - diff)}`, `${Math.abs(1200 - delay - diff)}`);
            setTimeout(function() {
                waitToSubmit(delay);
            }, 1000);
        }
    }

    function updateButtonText(message, timeRemaining){
        for (let i=0; i < 5; i++) {
            let button = document.getElementById(`wayfarerrtssbutton_${i}`);
            if (button === null) {
                break;
            }
            button.innerHTML = message;
        }

        button = document.getElementById(`wayfarerrtssbutton_r`);
        if (button !== null) {
            button.innerHTML = message;
        }
        button = document.getElementById(`wayfarerrtssbutton_d`);
        if (button !== null) {
            button.innerHTML = message;
        }

        let timerText = document.getElementById("wayfarerrtmr_counter");
        timerText.style.display = 'none';

        let counter = document.getElementById("wayfarerrtmr_subcounter");
        if (!counter) {
            counter = document.createElement('p');
            counter.innerHTML = timeRemaining;
            counter.id = "wayfarerrtmr_subcounter";
            counter.classList.add("wftmr_counter");
            timerText.parentNode.appendChild(counter);
        } else {
            counter.innerHTML = timeRemaining;
        }
    
        let counterLabel = document.getElementById("wayfarerrtmr_counterlabel");
        counterLabel.textContent = 'Submitting in:';
        counterLabel.style.fontWeight = "bold";
    }

    function randomIntFromInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
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

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    (function() {
        const css = `
          .wayfarerrtmr {
              color: #333;
              margin-left: 2em;
              padding-top: 0.3em;
              text-align: center;
              display: block;
          }

          .dark .wayfarerrtmr {
              color: #ddd;
          }

          .wftmr_counter {
              font-size: 20px;
              color: #20B8E3;
          }

          .wayfarerrtmr__button {
            background-color: #e5e5e5;
            border: none;
            color: #ff4713;
            margin: 10px;
            padding: 4px 10px;
            margin: 1px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 16px;
          }

          .dark .wayfarerrtmr__button {
            background-color: #404040;
            color: #20B8E3;
          }

          .wayfarercc {
                color: #333;
                margin-left: 2em;
                padding-top: 0.3em;
                text-align: center;
                display: none;
              }

            .wayfarercc_select {
                margin:  2px 12px;
                padding: 2px 12px;
                background-color: #FFFFFF;
                color: black;
            }

            .wayfarercc_input {
                margin:  2px 12px;
                padding: 2px 12px;
                width: 90px;
                background-color: #FFFFFF;
                color: black;
            }

            .wayfareres_settings_label {
                margin:  2px 12px;
                padding: 2px 12px;
                color: black;
                font-size: 16px;
            }

              .wayfarercc_parent {
                display: flex;
                margin: 16px 0px 0px;
              }

              .wayfarercc_text {
                font-size: 18px;
              }

              .wayfarercc_count {
                font-size: 18px;
                margin: 0px 0px 0px 80px;
              }

              .wayfarercc__visible {
                display: block;
              }

              .dark .wayfarerrh {
                color: #ddd;
              }

              .wfrt-smart-button {
                color: #20B8E3;
              }

              .wayfarercc__hiddendl {
                display: none;
              }

            .wrap-collabsible {
                margin: 1.2rem auto;
            }

            #collapsible,
            #collapsed-stats {
                display: none;
            }

            .lbl-toggle-es {
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
                width: 50%;
                margin: auto;
            }

            .lbl-toggle-es:hover {
                color: lightgrey;
            }

            .lbl-toggle-es::before {
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

            .toggle:checked+.lbl-toggle-es::before {
                transform: rotate(90deg) translateX(-3px);
            }

            .collapsible-content-es {
                max-height: 0px;
                overflow: hidden;
                transition: max-height .25s ease-in-out;
                font-size: 16px;
                background-color: #e5e5e5;
                border: 1px;
                border-radius: 3px;
                border-style: double;
                border-color: #ff4713;
                margin: auto;
                width: 50%;
            }

            .toggle:checked+.lbl-toggle-es+.collapsible-content-es {
                max-height: 9999999pt;
            }

            .toggle:checked+.lbl-toggle-es {
                border-bottom-right-radius: 0;
                border-bottom-left-radius: 0;
            }

            .collapsible-content-es .content-inner {
                border-bottom: 1px solid rgba(0, 0, 0, 1);
                border-left: 1px solid rgba(0, 0, 0, 1);
                border-right: 1px solid rgba(0, 0, 0, 1);
                border-bottom-left-radius: 7px;
                border-bottom-right-radius: 7px;
                padding: .5rem 1rem;
            }
        `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    })()
})();