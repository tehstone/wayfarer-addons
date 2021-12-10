// ==UserScript==
// @name         Wayfarer Nomination Stats
// @version      0.3.4
// @description  Add extended Wayfarer Profile stats
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-stats.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2021 tehstone
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

	addCss();

	function parseNominations(e) {
		try {
			const response = this.response;
			const json = JSON.parse(response);
			if (!json) {
				alert('Failed to parse response from Wayfarer');
				return;
			}
			// ignore if it's related to captchas
			if (json.captcha)
				return;

			nominations = json.result.nominations;
			if (!nominations) {
				alert('Wayfarer\'s response didn\'t include nominations.');
				return;
			}
			addNominationDetails();
			addExportButtons();
			if ("canAppeal" in json.result) {
				checkAppealStatus(json.result["canAppeal"]);
			}

		} catch (e)	{
			console.log(e); // eslint-disable-line no-console
		}
	}

	function addNominationDetails() {
		const ref = document.querySelector('app-nominations-list');

		if (!ref) {
			if (tryNumber === 0) {
				document.querySelector('body')
					.insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Clippy Copy initialization failed, refresh page</strong></div>');
				return;
			}
			setTimeout(addSettings, 1000);
			tryNumber--;
			return;
		}

		const nomCount = nominations.length;
		let acceptedCount = 0;
	    let deniedCount = 0;
	    let inVoteCount = 0;
        let inVoteUpgradeCount = 0;
	    let inQueueCount = 0;
        let inQueueUpgradeCount = 0;
	    let dupeCount = 0;
	    let withdrawnCount = 0;
	    let niaReviewCount = 0;

	    for(var i = 0; i < nomCount; i++){
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
	            default:
	                console.log("[WayFarer+] Encountered unknown status: " + nominations[i].status);
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

	    let html = "";
	    html += "Total Nominations: " + parseInt(nomCount) +
            "<br/>Accepted: " + parseInt(acceptedCount) + " (" + (Math.round(acceptedCount/nomCount*100)) + "%)" +
            "<br/>Rejected: " + parseInt(deniedCount) + " (" + (Math.round(deniedCount/nomCount*100)) + "%)" +
            "<br/>Withdrawn: " + parseInt(withdrawnCount) + " (" + (Math.round(withdrawnCount/nomCount*100)) + "%)" +
            "<br/>Duplicates: " + parseInt(dupeCount) + " (" + (Math.round(dupeCount/nomCount*100)) + "%)" +
            "<br/>In Voting: " + parseInt(inVoteCount) + " (" + parseInt(inVoteUpgradeCount) + " upgraded)" +
            "<br/>NIA Review: " + parseInt(niaReviewCount) +
            "<br/>In Queue: " + parseInt(inQueueCount) + " (" + parseInt(inQueueUpgradeCount) + " upgraded)" +
            "<br/>Accepted ratio: 1:" + Math.round(10*(1/(acceptedCount/deniedCount)))/10 + "<br/>";



        const div = document.createElement('div');
        div.classList.add('wayfarernd');
        div.innerHTML = html;
        collapsibleContent.appendChild(div);

        statsContainer.appendChild(collapsibleInput);
        statsContainer.appendChild(collapsibleLabel);
        statsContainer.appendChild(collapsibleContent);

        const container = ref.parentNode;
        container.appendChild(statsContainer);
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
	    let str = 'id,title,description,lat,lng,city,state,day,order,imageUrl,nextUpgrade,upgraded,status\r\n';

	    for (let i = 0; i < array.length; i++) {
	        let line = '';
	        for (let index in array[i]) {
	        	if (index === 'title' || index === 'description') {
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
		if (canAppeal) {
			alert("You are now eligible to appeal a nomination");
		}
	}

	function addCss() {
		const css = `
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
	  var file = new Blob(data, {type: dataType});
	  var objectURL = URL.createObjectURL(file);

	  var link = document.createElement('a');
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

