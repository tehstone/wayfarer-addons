// ==UserScript==
// @name         Wayfarer Extended Stats
// @version      0.7.1
// @description  Add extended Wayfarer Profile stats
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-extended-stats.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
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

function init() {
    const uuid = '04dae49a-ee23-4a62-a18e-bcfa2fbffaed'; // randomly generated, unique to this userscript, please don't re-use in other scripts

    let tryNumber = 10;
    let stats;
    let wddAuthMessageHandler = null;
    let userHash = 0;

    let selection = localStorage['wfcc_count_type_dropdown'];
      if (!selection) {
        selection = 'simple';
        localStorage['wfcc_count_type_dropdown'] = selection;
      }

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

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/profile' && method == 'GET') {
                this.addEventListener('load', parseStats, false);
            } else if (url == '/api/v1/vault/properties' && method == 'GET') {
                this.addEventListener('load', parseProps, false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    addCss();

    function parseStats(e) {
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

            stats = json.result;
            if (!stats) {
                console.warn('Wayfarer\'s response didn\'t include a candidate.');
                return;
            }
            awaitElement(() => document.querySelector('wf-rating-bar'))
            .then((ref) => {
                addSettings();
                addCopyLink();
            });

        } catch (e)    {
            console.warn(e); // eslint-disable-line no-console
        }
    }

    function parseProps(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            const props = json.result;
            if (props) {
                // Get a user ID to properly handle browsers shared between several users. Store a hash only, for privacy.
                userHash = cyrb53(props.socialProfile.email);
            }
        } catch (e) {
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

    function addSettings() {
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
        sectionLabel.innerText = "Stats Settings";
        sectionLabel.classList.add('wayfareres__bold');

        let select = document.createElement('select');
        select.title = "Select count type";
        const reviewTypes = [
          {name: "badgestat", title: "Medal Stat"},
          {name: "upgradecount", title: "Upgrade Count"},
          {name: "simple", title: "Simple"}
        ];
        select.innerHTML = reviewTypes.map(item => `<option value="${item.name}" ${item.name == selection ? 'selected' : ''}>${item.title}</option>`).join('');
        select.addEventListener('change', function () {
          selection = select.value;
          localStorage['wfcc_count_type_dropdown'] = selection;
          updateAgreementDisplay();
        });
        select.id = 'wayfarercccounttype';
        select.classList.add('wayfarercc_select');

        const selectLabel = document.createElement("label");
        selectLabel.innerText = "Agreement Count Type:";
        selectLabel.setAttribute("for", "wayfarercccounttype");
        selectLabel.classList.add('wayfareres_settings_label');
        selectLabel.title = "Count total agreements based on:\n - The number shown on your Pokemon Go Medal\n - Multiplying your earned upgrade total by 100 and adding your current progress\n - Simply adding Accepted + Rejected + Duplicated";

        let badgeCountInput = document.createElement('input');
        badgeCountInput.setAttribute("type", "number");
        badgeCountInput.setAttribute("size", '2');
        const userId = getUserId();
        let badgeCount = localStorage["wfcc_badge_count_" + userId];
        if (badgeCount === undefined || badgeCount === null || badgeCount === "" || badgeCount === "false"){
            badgeCount = 0;
        }
        badgeCountInput.value = badgeCount;
        badgeCountInput.addEventListener('change', function () {
            const userId = getUserId();
            badgeCount = parseInt(this.value);
            localStorage["wfcc_badge_count_" + userId] = badgeCount;
            updateOtherCount(badgeCount);
            updateAgreementDisplay();
        });
        badgeCountInput.id = "wayfarerccbadgecount";
        badgeCountInput.classList.add('wayfarercc_input');

        const badgeCountLabel = document.createElement("label");
        badgeCountLabel.innerText = "Pokemon Go Medal Count:";
        badgeCountLabel.setAttribute("for", "wayfarerccbadgecount");
        badgeCountLabel.classList.add('wayfareres_settings_label');
        badgeCountLabel.title = "You can also use the number on your Ingress Recon badge but it may be inflated due to past events where agreements earned double badge credit."

        let bonusUpgradeInput = document.createElement('input');
        bonusUpgradeInput.setAttribute("type", "number");
        bonusUpgradeInput.setAttribute("size", '2');
        let bonusUpgrade = localStorage["wfcc_bonus_upgrade_" + userId];
        if (bonusUpgrade === undefined || bonusUpgrade === null || bonusUpgrade === "" || bonusUpgrade === "false"){
            bonusUpgrade = 0;
        }
        bonusUpgradeInput.value = bonusUpgrade;
        bonusUpgradeInput.addEventListener('change', function () {
            const userId = getUserId();
            bonusUpgrade = this.value;
            localStorage["wfcc_bonus_upgrade_" + userId] = bonusUpgrade;
            updateAgreementDisplay();
        });
        bonusUpgradeInput.id - "wayfarerccbonusupgrade";
        bonusUpgradeInput.classList.add('wayfarercc_input');

        const bonusUpgradeLabel = document.createElement("label");
        bonusUpgradeLabel.innerText = "Bonus Upgrades Earned:";
        bonusUpgradeLabel.setAttribute("for", "wayfarerccbonusupgrade");
        bonusUpgradeLabel.classList.add('wayfareres_settings_label');
        bonusUpgradeLabel.title = "Enter the total number of upgrades earned in past events, without this number your total agreement count may be inflated."

        let offsetAgreementsInput = document.createElement('input');
        offsetAgreementsInput.setAttribute("type", "number");
        offsetAgreementsInput.setAttribute("size", '2');
        let offsetAgreements = parseInt(localStorage["wfcc_offset_agreements_" + userId]);
        if (offsetAgreements === undefined || offsetAgreements === null || offsetAgreements === "" || offsetAgreements === "false" || isNaN(offsetAgreements)){
            offsetAgreements = 0;
        }
        offsetAgreementsInput.value = offsetAgreements;
        offsetAgreementsInput.addEventListener('change', function () {
            const userId = getUserId();
            offsetAgreements = this.value;
            localStorage["wfcc_offset_agreements_" + userId] = offsetAgreements;
            updateAgreementDisplay();
        });
        offsetAgreementsInput.id - "wayfarerccoffsetagreements";
        offsetAgreementsInput.classList.add('wayfarercc_input');

        const offsetAgreementsLabel = document.createElement("label");
        offsetAgreementsLabel.innerText = "Agreements Offset:";
        offsetAgreementsLabel.setAttribute("for", "wayfarerccoffsetagreements");
        offsetAgreementsLabel.classList.add('wayfareres_settings_label');
        offsetAgreementsLabel.title = "If you earned agreements prior to the release of Upgrades or have other cases where your agreement count is off by a known amount enter that amount here."

        const wddAutoImportBox = document.createElement('span');
        wddAutoImportBox.classList.add('wayfarercc_input');
        wddAutoImportBox.classList.add('wayfareres_autoimport_box');
        const wddImportLSKey = "wfes_wdd_auth_data_" + userId;
        const wddImportLastDate = "wfes_wdd_last_submit_" + userId;
        const renderUser = box => {
            const dataStr = localStorage[wddImportLSKey];
            if (!dataStr) return;
            const wddAuthData = JSON.parse(dataStr);
            const avatar = document.createElement('img');
            avatar.src = wddAuthData.avatar;
            box.appendChild(avatar);
            const name = document.createElement('span');
            name.textContent = wddAuthData.name;
            box.appendChild(name);
            const dcButton = document.createElement('button');
            dcButton.innerHTML = '&#x274C;';
            dcButton.addEventListener('click', () => {
                if (confirm('Are you sure you wish to stop auto-submitting your stats to WDD?')) {
                    localStorage.removeItem(wddImportLSKey);
                    location.reload();
                }
            });
            dcButton.style.marginLeft = '5px';
            box.appendChild(dcButton);
            sendToKingClippy();
        }

        const sendToKingClippy = () => {
            const now = Date.now();
            const dataStr = localStorage[wddImportLSKey];
            if (!dataStr) return;
            const lastImport = parseInt(localStorage[wddImportLastDate] || '0');
            if (now - lastImport < 3600000) return;
            localStorage[wddImportLastDate] = now + '';
            const wddAuthData = JSON.parse(dataStr);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://apps.varden.info/wfptools/wdd/post-stats.php', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({
                id: wddAuthData.id,
                data: makeStats()
            }));
        };

        const wddAuthImportLabel = document.createElement('span');
        wddAuthImportLabel.textContent = 'Auto-submit to WDD:';
        wddAuthImportLabel.title = "You can use this function to auto-submit your stats to King Clippy's leaderboards if you are part of the Wayfarer Discussion Discord.";
        wddAuthImportLabel.classList.add('wayfareres_settings_label');
        if (localStorage.hasOwnProperty(wddImportLSKey)) {
            renderUser(wddAutoImportBox);
        } else {
            const wddAuthButton = document.createElement('button');
            wddAuthButton.textContent = 'Authenticate';
            wddAuthButton.addEventListener('click', () => {
                if (confirm(
                    'Membership in the Wayfarer Discussion Discord (WDD) is required to use this function.'
                    + '\n\nPRIVACY NOTICE\nBy using this function, your stats will be automatically submitted to WDD and King Clippy. '
                    + 'Whenever such a submission occurs, the submission will be logged in WDD alongside your Discord ID and the exact timestamp '
                    + 'of the submission. The submission log is visible to WDD administrators, who may access these logs at any time, for any purpose. '
                    + 'Additionally, all stats submissions are publicly visible to everyone in the #clippys-corner channel in WDD.'
                    + '\n\nSubmissions are processed through a third-party web service operated by the WDD administrators. When you authenticate '
                    + 'your Discord account through WF Extended Stats, this web service will validate your Discord credentials and verify your membership '
                    + 'in WDD. If successful, your browser is issued an encrypted token (ticket) that identifies your Discord account. '
                    + 'The token is used by the web service to connect your submitted statistics to your Discord account. The web service will '
                    + 'NEVER have access to your Discord password.'
                    + '\n\nClicking OK in this dialog box indicates your consent to data processing in accordance with these terms. '
                    + 'If you do not consent to these terms, please press Cancel now. If you wish to withdraw your consent in the future, '
                    + 'please contact WDD staff, who will assist you in purging your data from WDD.')) {
                    const wddAuthWindow = window.open('https://apps.varden.info/wfptools/wdd/');
                    wddAuthMessageHandler = ({ data }) => {
                        wddAuthWindow.close();
                        wddAutoImportBox.removeChild(wddAuthButton);
                        localStorage[wddImportLSKey] = JSON.stringify(data);
                        renderUser(wddAutoImportBox);
                        setTimeout(() => {
                            alert('Connection successful! Please note that stats are only submitted to WDD when you visit the Profile page in Wayfarer (this page). If you do not visit this page, your statistics will not be submitted.');
                        }, 10);
                    };
                }
            });
            wddAutoImportBox.appendChild(wddAuthButton);
        }

        const helpLabel = document.createElement("label");
        helpLabel.innerText = "Hover mouse over each item for an explanation.";
        helpLabel.classList.add('wayfareres_settings_label');

        settingsDiv.appendChild(sectionLabel);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(selectLabel);
        settingsDiv.appendChild(select);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(badgeCountLabel);
        settingsDiv.appendChild(badgeCountInput);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(bonusUpgradeLabel);
        settingsDiv.appendChild(bonusUpgradeInput);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(offsetAgreementsLabel);
        settingsDiv.appendChild(offsetAgreementsInput);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(wddAuthImportLabel);
        settingsDiv.appendChild(wddAutoImportBox);
        settingsDiv.appendChild(document.createElement('br'));
        settingsDiv.appendChild(helpLabel);
        settingsDiv.appendChild(document.createElement('br'));
    }

    function updateOtherCount(badgeCount) {
        const {accepted, rejected, duplicated} = stats;
        const otherCount = badgeCount - accepted - rejected - duplicated;
        const userId = getUserId();
        localStorage["wfcc_other_count_" + userId] = otherCount;
    }

    function updateAgreementDisplay() {
        const {accepted, rejected, duplicated, finished, total, available, progress} = stats;
        const newCount = getTotalAgreementCount(stats);

        let countDiv = document.getElementById("totalcountnumber");
        if (countDiv !== null) {
            const percent = ((newCount / finished)*100).toFixed(1);
            countDiv.innerHTML = newCount + " (" + percent + "%)";
        }

        let otherDiv = document.getElementById("othercountnumber");
        if (otherDiv !== null) {
            let other = 0;
            let count_type = localStorage['wfcc_count_type_dropdown'];
            if (count_type !== "simple") {
                other = newCount - (accepted + rejected + duplicated);
            }
            otherDiv.innerHTML = other;
        }
    }

    function addCopyLink() {
        const div = document.createElement('div');
        let exportButton = document.createElement('button');
        exportButton.innerHTML = "Copy Stats";
        exportButton.onclick = function() {
          exportStats();
        }
        exportButton.classList.add('wayfarercc__button');
        exportButton.id = "wayfarerccexport";

        div.appendChild(document.createElement('br'));
        div.appendChild(exportButton);

        const ref = document.querySelector('wf-rating-bar');
        const container = ref.parentNode;
        container.appendChild(div);

        let CCButton = div;
        CCButton.classList.add('wayfarercc__visible');

        awaitElement(() => document.getElementsByClassName("wf-profile-stats__section-title"))
            .then((ref) => setTimeout(() =>
            {
                const parentRef = ref[0];
                const totalparent = document.createElement('div');
                let totaltext = document.createElement('div');
                totaltext.innerHTML = "Processed & Agreement";
                totaltext.classList.add("wayfareres_text");

                let totalcount = document.createElement('div');
                totalcount.id = "totalcountnumber"
                const {accepted, rejected, duplicated, finished, available, progress, total} = stats;
                let allAgreements = getTotalAgreementCount(stats);
                if (allAgreements === 0 ) {
                    allAgreements = accepted + rejected + duplicated;
                }
                const percent = ((allAgreements / finished)*100).toFixed(1);
                totalcount.innerHTML = allAgreements + " (" + percent + "%)";
                totalcount.classList.add("wayfareres_count");

                totalparent.appendChild(totaltext);
                totalparent.appendChild(totalcount);
                insertAfter(totalparent, parentRef);
                totalparent.classList.add("profile-stats__stat");
                totalparent.classList.add("wayfareres_parent");

                const otherparent = document.createElement('div');
                let othertext = document.createElement('div');
                othertext.innerHTML = "Other Agreements";
                othertext.classList.add("wayfareres_text");

                let other = 0;
                let count_type = localStorage['wfcc_count_type_dropdown'];
                if (count_type !== "simple") {
                    other = allAgreements - (accepted + rejected + duplicated);
                }

                let othercount = document.createElement('div');
                othercount.id = "othercountnumber"
                othercount.innerHTML = other;
                othercount.classList.add("wayfareres_count");

                otherparent.appendChild(othertext);
                otherparent.appendChild(othercount);
                insertAfter(otherparent, parentRef.parentElement.lastChild );
                otherparent.classList.add("profile-stats__stat");
                otherparent.classList.add("wayfareres_parent");
            }, 500));
    }

    function getTotalAgreementCount(stats) {
        const {accepted, rejected, duplicated, finished, available, progress, total} = stats;
        const countType = localStorage['wfcc_count_type_dropdown'];
        if (countType === "badgestat") {
            const userId = getUserId();
            let badgeCount = localStorage["wfcc_badge_count_" + userId];
            if (badgeCount === undefined || badgeCount === null || badgeCount === "" || badgeCount === "false" || isNaN(badgeCount)){
                badgeCount = 0;
            }
            let otherCount = localStorage["wfcc_other_count_" + userId];
            if (otherCount === undefined || otherCount === null || otherCount === "" || otherCount === "false" || isNaN(otherCount)){
                return badgeCount;
            }
            otherCount = parseInt(otherCount);
            return accepted + rejected + duplicated + otherCount;
        } else if (countType === "upgradecount" ) {
            const userId = getUserId();
            let bonusUpgrade = parseInt(localStorage["wfcc_bonus_upgrade_" + userId]);
            if (bonusUpgrade === undefined || bonusUpgrade === null || bonusUpgrade === "" || bonusUpgrade === "false" || isNaN(bonusUpgrade)){
                bonusUpgrade = 0;
            }
            let offsetAgreements = parseInt(localStorage["wfcc_offset_agreements_" + userId]);
            if (offsetAgreements === undefined || offsetAgreements === null || offsetAgreements === "" || offsetAgreements === "false" || isNaN(offsetAgreements)){
                offsetAgreements = 0;
            }
            return (total + available - bonusUpgrade) * 100 + progress + offsetAgreements;
        } else {//"simple"
            return accepted + rejected + duplicated;
        }
    }

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    const makeStats = () => {
        const {performance, finished, accepted, rejected, duplicated, available, progress, total} = stats;
        let total_agreements = getTotalAgreementCount(stats);
        const base_agreements = accepted + rejected + duplicated;
        let other = total_agreements - base_agreements;

        let count_type = localStorage['wfcc_count_type_dropdown'];
        if (count_type === "badgestat") {
            count_type = "facts";
        } else if (count_type === "upgradecount" ) {
            count_type = "aprox";
        } else {
            count_type = "simple";
            other = 0;
        }

        const userId = getUserId();
        let badgeCount = localStorage["wfcc_badge_count_" + userId];
        if (badgeCount === undefined || badgeCount === null || badgeCount === "" || badgeCount === "false"){
            badgeCount = 0;
        } else {
            badgeCount = parseInt(badgeCount);
        }
        let bonusUpgrade = parseInt(localStorage["wfcc_bonus_upgrade_" + userId]);
        if (bonusUpgrade === undefined || bonusUpgrade === null || bonusUpgrade === "" || bonusUpgrade === "false" || isNaN(bonusUpgrade)){
            bonusUpgrade = 0;
        }
        let offsetAgreements = parseInt(localStorage["wfcc_offset_agreements_" + userId]);
        if (offsetAgreements === undefined || offsetAgreements === null || offsetAgreements === "" || offsetAgreements === "false" || isNaN(offsetAgreements)){
            offsetAgreements = 0;
        }

        const exportData = {
            "current_rating": performance,
            "total_nominations": finished,
            "total_agreements": total_agreements,
            "accepted": accepted,
            "rejected": rejected,
            "duplicates": duplicated,
            "other": other,
            "upgrades_available": available,
            "current_progress": progress,
            "upgrades_redeemed": total,
            "extended_type": count_type,
            "badge_count": badgeCount,
            "bonus_upgrades": bonusUpgrade,
            "agreement_offset": offsetAgreements
        };
        return exportData;
        };

    function exportStats() {
      const exportData = makeStats();
      navigator.clipboard.writeText(JSON.stringify(exportData));
    }

    function getUserId() {
        return userHash + '';
    }

    window.addEventListener('message', e => {
        if (e.data.uuid !== uuid) return;
        if (e.origin === 'https://apps.varden.info' && wddAuthMessageHandler) {
            wddAuthMessageHandler(e.data);
            wddAuthMessageHandler = null;
        }
    });

    function addCss() {
        const css = `

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

              .wayfareres_parent {
                  display: flex;
                  justify-content: space-between;
                  margin: 16px 0px 0px;
              }

              .wayfareres_text {
                  font-size: 18px;
              }

              .wayfareres_count {
                  font-size: 18px;
                  display: flex;
                  margin: 0px 0px 0px 0px;
              }

              .wayfarercc__visible {
                display: block;
              }

              .dark .wayfarerrh {
                color: #ddd;
              }

              .wayfarercc__button {
                background-color: #e5e5e5;
                border: none;
                color: #ff4713;
                padding: 4px 10px;
                margin: 1px;
                text-align: center;
                text-decoration: none;
                display: inline-block;
                font-size: 16px;
              }

              .dark .wayfarercc__button {
                background-color: #404040;
                color: #20B8E3;
              }

              .wayfarercc__hiddendl {
                display: none;
              }

            .wrap-collabsible {
                margin-bottom: 1.2rem;
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

            .content-inner td:last-child {
                text-align: right;
            }

            th,
            td {
                border: white solid 1pt;
                padding: 1pt 5pt;
            }

            .wayfareres__bold {
                margin:  2px 12px;
                padding: 2px 12px;
                font-size: 1.1em;
                font-weight: bold;
                color: black;
            }

            .wayfareres_autoimport_box {
                background-color: #eee !important;
                font-weight: bold;
            }

            .wayfareres_autoimport_box img {
                height: 1em;
                display: inline-block;
                margin-right: 5px;
                margin-top: -4px;
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
    }
}

init();
