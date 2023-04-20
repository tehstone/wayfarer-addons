// ==UserScript==
// @name         Wayfarer Nomination Stats
// @version      0.6.1
// @description  Add extended Wayfarer Profile stats
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-stats.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2023 tehstone
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
                console.log('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha)
                return;

            nominations = json.result.nominations;
            if (!nominations) {
                console.log('Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            setTimeout(() => {
                addNominationDetails();
                addExportButtons();
                if ("canAppeal" in json.result) {
                    checkAppealStatus(json.result["canAppeal"]);
                }
                addUpgradeSetting();
            }, 300);
            

        } catch (e)    {
            console.log(e); // eslint-disable-line no-console
        }
    }

    function addNominationDetails() {
        awaitElement(() => document.querySelector('app-nominations-list'))
            .then((ref) => {
                addNotificationDiv();
                addCss();
                const nomCount = nominations.length;
                let acceptedCount = 0;
                let appealedCount = 0;
                let deniedCount = 0;
                let inVoteCount = 0;
                let inVoteUpgradeCount = 0;
                let inQueueCount = 0;
                let inQueueUpgradeCount = 0;
                let dupeCount = 0;
                let withdrawnCount = 0;
                let niaReviewCount = 0;
                let nextUpgradeSet = false;
                let heldCount = 0;

                for(let i = 0; i < nomCount; i++){
                    if (nominations[i]["nextUpgrade"] === true) {
                        nextUpgradeSet = true;
                    }
                    switch (nominations[i].status){
                        case "NOMINATED":
                            inQueueCount++;
                            if (nominations[i].upgraded)
                                inQueueUpgradeCount++;
                            break;
                        case "VOTING":
                            inVoteCount++;
                            if (nominations[i].upgraded)
                                inVoteUpgradeCount++;
                            break;
                        case "REJECTED":
                            deniedCount++;
                            break;
                        case "APPEALED":
                            appealedCount++;
                            break;
                        case "ACCEPTED":
                            acceptedCount++;
                            break;
                        case "DUPLICATE":
                            dupeCount++;
                            break;
                        case "WITHDRAWN":
                            withdrawnCount++;
                            break;
                        case "NIANTIC_REVIEW":
                            niaReviewCount++;
                            break;
                        case "HELD":
                            heldCount++;
                            break;
                        default:
                            console.log("Wayfarer Nomination Stats encountered unknown status: " + nominations[i].status);
                            break;
                    }
                }

                const statsContainer = document.createElement('div');
                statsContainer.setAttribute('class', 'wrap-collabsible')
                statsContainer.id = "nomStats";

                const collapsibleInput = document.createElement("input");
                collapsibleInput.id = "collapsed-stats";
                collapsibleInput.setAttribute("class", "toggle");
                collapsibleInput.type = "checkbox";

                const collapsibleLabel = document.createElement("label");
                collapsibleLabel.setAttribute("class", "lbl-toggle-ns");
                collapsibleLabel.innerText = "View Nomination Stats";
                collapsibleLabel.setAttribute("for", "collapsed-stats");

                const collapsibleContent = document.createElement("div");
                collapsibleContent.setAttribute("class", "collapsible-content-ns");

                const totalReviewed = parseInt(acceptedCount) + parseInt(deniedCount) + parseInt(dupeCount);
                let html = "";
                console.log("click here!!!!!!!!!!")
                html += "Total Nominations: " + parseInt(nomCount) +
                    "<br/>Total Reviewed: " + parseInt(totalReviewed) +
                    "<br/>Accepted: " + parseInt(acceptedCount) + " (" + (Math.round((acceptedCount/totalReviewed)*10000)/100) + "%)" +
                    "<br/>Rejected: " + parseInt(deniedCount) + " (" + (Math.round((deniedCount/totalReviewed)*10000)/100) + "%)" +
                    "<br/>Duplicates: " + parseInt(dupeCount) + " (" + (Math.round((dupeCount/totalReviewed)*10000)/100) + "%)" +
                    "<br/>In Voting: " + parseInt(inVoteCount) + " (" + parseInt(inVoteUpgradeCount) + " upgraded)" +
                    "<br/>In Queue: " + parseInt(inQueueCount) + " (" + parseInt(inQueueUpgradeCount) + " upgraded)" +
                    "<br/>NIA Review: " + parseInt(niaReviewCount) +
                    "<br/>Appealed: " + parseInt(appealedCount) + " (" + (Math.round(appealedCount/nomCount*100)) + "%)" +
                    "<br/>Withdrawn: " + parseInt(withdrawnCount) + " (" + (Math.round(withdrawnCount/nomCount*100)) + "%)" +
                    "<br/>On Hold: " + parseInt(heldCount) + "<br/>";

                const div = document.createElement('div');
                div.classList.add('wayfarernd');
                div.innerHTML = html;
                collapsibleContent.appendChild(div);

                statsContainer.appendChild(collapsibleInput);
                statsContainer.appendChild(collapsibleLabel);
                statsContainer.appendChild(collapsibleContent);

                const container = ref.parentNode;
                container.appendChild(statsContainer);

                const userId = getUserId();
                let upgradeNotify = localStorage.getItem(`wfns_upgrade_notify_${userId}`);
                if (upgradeNotify === undefined || upgradeNotify === null || upgradeNotify === ""){
                    upgradeNotify = false;
                }

                if (upgradeNotify === "true") {
                    if (!nextUpgradeSet) {
                        createNotification("No Upgrade Next is set!");
                    }
                }
            });
        
    }

    function addExportButtons() {
        if (document.getElementById("wayfarernsexport") !== null) {
            return;
        }
        const ref = document.querySelector('wf-logo');
        const div = document.createElement('div');

        let exportButton = document.createElement('button');
            exportButton.innerHTML = "Export JSON";
            exportButton.onclick = function() {
              exportNominationsJson();
        }
        exportButton.classList.add('wayfarerns__button');
        exportButton.id = "wayfarernsexport";
        div.appendChild(exportButton);

        let exportCsvButton = document.createElement('button');
            exportCsvButton.innerHTML = "Export CSV";
            exportCsvButton.onclick = function() {
              exportNominationsCsv();
        }
        exportCsvButton.classList.add('wayfarerns__button');
        exportCsvButton.id = "wayfarernsexport";
        div.appendChild(exportCsvButton);

        const container = ref.parentNode.parentNode;
        container.appendChild(div);

        RHButtons = div;
        RHButtons.classList.add('wayfarerns__visible');
    }

    function exportNominationsJson() {
        const dataStr = JSON.stringify(nominations);

        if (typeof window.saveFile != 'undefined') {
            window.saveFile(dataStr, 'nominations.json', 'application/json');
            return;
        }
    }

    function exportNominationsCsv() {
        const csv = convertToCSV(nominations);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        let link = document.createElement("a");
        if (link.download !== undefined) {
            link.setAttribute("href", url);
            link.setAttribute("download", 'nominations.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

    }

    function convertToCSV(objArray) {
        let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
        let str = 'id,group,type,title,description,lat,lng,city,state,day,order,imageUrl,nextUpgrade,upgraded,status,isMutable,isNianticControlled,statement,supportingImageUrl,rejectReasons,canAppeal,isClosed,appealNotes,canHold,canReleaseHold\r\n';

        for (let i = 0; i < array.length; i++) {
            let line = '';
            for (let index in array[i]) {
                if (index === 'title' || index === 'description' || index === 'statement' || index === 'appealNotes') {
                    array[i][index] = array[i][index].replace(/#/g, '').replace(/"/g, '""');
                    array[i][index] = `"${array[i][index]}"`;
                }
                if (line != '') line += ','

                line += array[i][index];
            }

            str += line + '\r\n';
        }

        return str;
    }

    function checkAppealStatus(canAppeal) {
        awaitElement(() => document.querySelector('wf-logo')).then(ref => {
            const div = document.createElement('div');
            div.className = 'wayfarernost';

            let appealLabel = document.createElement('p');
            appealLabel.textContent = 'Appeal eligible: ';
            let appeal = document.createElement('p');

            if (canAppeal) {
                appeal.textContent = 'Yes';
            } else {
                appeal.textContent = 'No';
            }

            div.appendChild(appealLabel);
            div.appendChild(appeal);

            const container = ref.parentNode.parentNode;
            console.log(document.querySelector('.wayfarernost'));
            if (document.querySelector('.wayfarernost') === null) {
                container.appendChild(div);
            }
        });
    }

    function addUpgradeSetting() {
        awaitElement(() => document.querySelector(".cdk-virtual-scroll-content-wrapper")).then(ref => {
            const listEl = document.querySelector(".cdk-virtual-scroll-content-wrapper");
            const insDiv = document.querySelector(".mt-2");
            const userId = getUserId();

            let upgradeNotifyChkbox = document.createElement("INPUT");
            upgradeNotifyChkbox.setAttribute("type", "checkbox");

            upgradeNotifyChkbox.id = 'wayfarernsupgradenotifychkbox';

            const upgradeNotifyChkboxLabel = document.createElement("label");
            upgradeNotifyChkboxLabel.innerText = "Notify when no Upgrade Next set:";
            upgradeNotifyChkboxLabel.setAttribute("for", "wayfarernsupgradenotifychkbox");

            insDiv.insertBefore(upgradeNotifyChkbox, insDiv.children[0]);
            insDiv.insertBefore(upgradeNotifyChkboxLabel, insDiv.children[0]);

            let upgradeNotify = localStorage.getItem(`wfns_upgrade_notify_${userId}`);
            if (upgradeNotify === undefined || upgradeNotify === null || upgradeNotify === ""){
                upgradeNotify = false;
            }
            upgradeNotify = upgradeNotify === "true";

            if (upgradeNotify) {
            	upgradeNotifyChkbox.checked = true;
            }

            upgradeNotifyChkbox.addEventListener('click', e => {
                localStorage.setItem(`wfns_upgrade_notify_${userId}`, e.target.checked);
                console.log(e.target.checked);
            });
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
                notification.setAttribute("class", "wfnsNoUpgradeNextNotification wfnsBgRed");
                break;
        }
        notification.onclick = function(){
            notification.remove();
        };

        let content = document.createElement("p");
        content.innerText = message;

        // Purely aesthetic (The whole div closes the notification)
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

    function addCss() {
        const css = `
            #wfnsNotify{
                position: absolute;
                bottom: 1em;
                right: 1em;
                width: 30em;
                z-index: 100;
                }
                .wfnsNoUpgradeNextNotification{
                border-radius: 0.5em;
                padding: 1em;
                margin-top: 1.5em;
                color: white;
                }
                .wfnsBgRed{
                background-color: #CC0000B0;
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

    function saveAs (data,filename,dataType) {
      if (!(data instanceof Array)) { data = [data]; }
      let file = new Blob(data, {type: dataType});
      let objectURL = URL.createObjectURL(file);

      let link = document.createElement('a');
      link.href = objectURL;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(objectURL);
    }

    window.saveFile = typeof android === 'undefined' || !android.saveFile
          ? saveAs : function (data,filename,dataType) {
      android.saveFile(filename || '', dataType || '*/*', data);
    };
}

init();

