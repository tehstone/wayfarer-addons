// ==UserScript==
// @name         Wayfarer Nomination Stats
// @version      0.7.3
// @description  Add extended Wayfarer Profile stats
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-stats.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2024 tehstone, Tntnnbltn
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

            nominations = json.result.submissions;
            if (!nominations) {
                console.log('Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            setTimeout(() => {
                addNominationDetails();
                addExportButtons();
                addUpgradeSetting();
            }, 300);
            

        } catch (e)    {
            console.log(e); // eslint-disable-line no-console
        }
    }

    async function addNominationDetails() {
        awaitElement(() => document.querySelector('app-submissions-list'))
            .then((ref) => {
            addNotificationDiv();
            addCss();

            const countsByTypeAndStatus = {
                "NOMINATION": {},
                "EDIT": {},
                "EDIT_LOCATION": {},
                "EDIT_DESCRIPTION": {},
                "EDIT_TITLE": {},
                "PHOTO": {},
                "TOTAL": {},
            };

            for (let i = 0; i < nominations.length; i++) {
                const { type, status, upgraded } = nominations[i];

                if (!countsByTypeAndStatus[type]) {
                    countsByTypeAndStatus[type] = {};
                }
                if (!countsByTypeAndStatus[type][status]) {
                    countsByTypeAndStatus[type][status] = 0;
                }

                // Increment counts based on status and upgraded flag
                // Not currently displayed in the stats
                countsByTypeAndStatus[type][status]++;
                if (status === "NOMINATED" && upgraded) {
                    countsByTypeAndStatus[type]["NOMINATED_UPGRADED"] = (countsByTypeAndStatus[type]["NOMINATED_UPGRADED"] || 0) + 1;
                } else if (status === "VOTING" && upgraded) {
                    countsByTypeAndStatus[type]["VOTING_UPGRADED"] = (countsByTypeAndStatus[type]["VOTING_UPGRADED"] || 0) + 1;
                }

                if (["ACCEPTED", "REJECTED", "DUPLICATE"].includes(status)) {
                    countsByTypeAndStatus[type]["DECIDED"] = (countsByTypeAndStatus[type]["DECIDED"] || 0) + 1;
                }
                if (["ACCEPTED", "REJECTED", "DUPLICATE", "VOTING", "NOMINATED", "NIANTIC_REVIEW", "APPEALED", "WITHDRAWN", "HELD"].includes(status)) {
                    countsByTypeAndStatus[type]["SUBMITTED"] = (countsByTypeAndStatus[type]["SUBMITTED"] || 0) + 1;
                }

            }

            // Sum the stats for the different types of edits
            const statusTypes = ["SUBMITTED", "DECIDED", "ACCEPTED", "REJECTED", "DUPLICATE", "VOTING", "NOMINATED", "NIANTIC_REVIEW", "APPEALED", "WITHDRAWN", "HELD"];
            for (const type of statusTypes) {
                countsByTypeAndStatus.EDIT[type] = 0;
                for (const editType of ["EDIT_TITLE", "EDIT_DESCRIPTION", "EDIT_LOCATION"]) {
                    countsByTypeAndStatus.EDIT[type] += countsByTypeAndStatus[editType][type] ?? 0;
                }
            }

            // Sum the total stats
            for (const type of statusTypes) {
                countsByTypeAndStatus.TOTAL[type] = 0;
                for (const editType of ["EDIT", "NOMINATION", "PHOTO"]) {
                    countsByTypeAndStatus.TOTAL[type] += countsByTypeAndStatus[editType][type] ?? 0;
                }
            }


            let html = "<table class='wfns-stats-table'>";
            html += "<colgroup>";
            html += "<col style='width: 20%;'>".repeat(4);
            html += "</colgroup>";
            html += "<tr><th></th><th>Nominations</th><th>Edits</th><th>Photos</th><th>Total</th></tr>";

            const statusLabels = ["Submitted", "Decided", "Accepted", "Rejected", "Duplicates", "In Voting", "In Queue", "NIA Review", "Appealed", "Withdrawn", "On Hold"];
            const columnTypes = ["NOMINATION", "EDIT", "PHOTO", "TOTAL"];

            for (let i = 0; i < statusLabels.length; i++) {
                const status = statusTypes[i];
                html += "<tr><td>" + statusLabels[i] + "</td>";

                for (let j = 0; j < columnTypes.length; j++) {
                    const columnType = columnTypes[j];
                    let count = 0;
                    let decidedCount = countsByTypeAndStatus[columnType]["DECIDED"] || 0;

                    count += countsByTypeAndStatus[columnType][status] || 0;

                    // Append percentage only for "Accepted" and "Rejected" statuses
                    if (status === "ACCEPTED" || status === "REJECTED") {
                        let percentage = Math.round((count / decidedCount) * 100);
                        if (isNaN(percentage)) {
                            percentage = "—%";
                        } else {
                            percentage += "%";
                        }
                        html += "<td id='" + columnType + "-" + status.replace(/ /g, '-') + "'>" + count + "<br><span style='font-size: smaller'>" + percentage + "</span></td>";;
                    } else {
                        html += "<td id='" + columnType + "-" + status.replace(/ /g, '-') + "'>" + count + "</td>";
                    }
                }
                html += "</tr>";
            }

            html += "</table>";

            const statsContainer = document.createElement('div');
            statsContainer.setAttribute('class', 'wrap-collabsible');
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
            collapsibleContent.innerHTML = html;

            statsContainer.appendChild(collapsibleInput);
            statsContainer.appendChild(collapsibleLabel);
            statsContainer.appendChild(collapsibleContent);

            const container = ref.parentNode;
            container.appendChild(statsContainer);

            // Check upgrade notification
            const userId = getUserId();
            let upgradeNotify = localStorage.getItem(`wfns_upgrade_notify_${userId}`);
            if (upgradeNotify === undefined || upgradeNotify === null || upgradeNotify === "") {
                upgradeNotify = false;
            }

            // Display notification if upgrade is not set
            const nextUpgradeSet = nominations.some(nom => nom.nextUpgrade);
            if (upgradeNotify === "true" && !nextUpgradeSet) {
                createNotification("No Upgrade Next is set!");
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

        // Extract all possible headers including poiData fields
        let headers = new Set();
        array.forEach(item => {
            Object.keys(item).forEach(key => {
                if (Array.isArray(item[key])) {
                    item[key].forEach(poi => {
                        Object.keys(poi).forEach(poiKey => {
                            headers.add(`poiData_${poiKey}`);
                        });
                    });
                } else if (key === 'poiData') {
                    Object.keys(item[key]).forEach(poiKey => {
                        headers.add(`poiData_${poiKey}`);
                    });
                } else {
                    headers.add(key);
                }
            });
        });

        // Generate CSV headers dynamically from headers
        let csv = [...headers].join(',') + '\r\n';

        // Generate CSV rows
        array.forEach(item => {
            let row = '';
            [...headers].forEach(header => {
                if (header.startsWith('poiData_')) {
                    let poiKey = header.substring(8);
                    if (Array.isArray(item.poiData)) {
                        let poiDataValue = '';
                        item.poiData.forEach(poi => {
                            poiDataValue += `${poi[poiKey]},`;
                        });
                        row += `"${poiDataValue.slice(0, -1)}",`; // Remove trailing comma
                    } else {
                        row += `"${String(item.poiData[poiKey] || '').replace(/"/g, '""')}",`;
                    }
                } else {
                    row += `"${String(item[header] || '').replace(/"/g, '""')}",`;
                }
            });
            csv += row.slice(0, -1) + '\r\n'; // Remove trailing comma
        });

        return csv;
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

            .wayfarerns__visible {
                display: block;
            }

            .wayfarerns__button {
                background-color: #e5e5e5;
                border: none;
                color: #ff4713;
                padding: 10px 10px;
                margin: 10px;
                border-radius: .375rem;
                text-align: center;
                text-decoration: none;
                display: inline-block;
                font-size: 16px;
            }

            .wayfarerns__button:hover {
                background-color: #bdbbbb;
                transition: 0.2s;
            }

            .dark .wayfarerns__button {
                background-color: #404040;
                color: #20B8E3;
            }

            .dark .wayfarerns__button:hover {
                background-color: #707070;
                transition: 0.2s;
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
            .wfns-stats-table {
                width: 100%;
            }
            .wfns-stats-table th:first-child,
            .wfns-stats-table td:first-child {
                text-align: left; /* Left-align the content within the first column */
            }
            .wfns-stats-table th:not(:first-child),
            .wfns-stats-table td:not(:first-child) {
                text-align: center; /* Center-align the content within columns 2 to 5 */
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

