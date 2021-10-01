// ==UserScript==
// @name         Wayfarer Extended Stats
// @version      0.3.0
// @description  Add extended Wayfarer Profile stats
// @namespace    https://github.com/tehstone/wayfarer-extended-stats
// @downloadURL  https://github.com/tehstone/wayfarer-extended-stats/raw/main/wayfarer-es.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-extended-stats
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */

function init() {
	let tryNumber = 10;
	let stats;

	let selection = localStorage['wfcc_count_type_dropdown'];
	  if (!selection) {
	    selection = 'upgradecount';
	    localStorage['wfcc_count_type_dropdown'] = selection;
	  }

	/**
	 * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
	 */
	(function (open) {
		XMLHttpRequest.prototype.open = function (method, url) {
			if (url == '/api/v1/vault/profile') {
				if (method == 'GET') {
					this.addEventListener('load', parseStats, false);
				}
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
				alert('Failed to parse response from Wayfarer');
				return;
			}
			// ignore if it's related to captchas
			if (json.captcha)
				return;

			stats = json.result;
			if (!stats) {
				alert('Wayfarer\'s response didn\'t include a candidate.');
				return;
			}
			addSettings();
			addCopyLink();

		} catch (e)	{
			console.log(e); // eslint-disable-line no-console
		}

	}

	function addSettings() {
		const ref = document.querySelector('app-rating-bar');

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

		const testelem = document.getElementById("wayfarercccounttype");
	    if (testelem !== null) {
	      return;
	    }

		const div = document.createElement('div');
		let select = document.createElement('select');
	    select.title = "Select count type";
	    const reviewTypes = [
	      {name: "badgestat", title: "Badge Stat"},
	      {name: "upgradecount", title: "Upgrade Count"}
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
	        badgeCount = this.value;
	    	localStorage["wfcc_badge_count_" + userId] = badgeCount;
	    	updateAgreementDisplay();
	    });
		badgeCountInput.id - "wayfarerccbadgecount";
	    badgeCountInput.classList.add('wayfarercc_input');

	    const badgeCountLabel = document.createElement("label");
        badgeCountLabel.innerText = "Badge Agreement Count:";
        badgeCountLabel.setAttribute("for", "wayfarerccbadgecount");
        badgeCountLabel.classList.add('wayfareres_settings_label');

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

	    div.appendChild(selectLabel);
	    div.appendChild(select);
	    div.appendChild(document.createElement('br'))
	    div.appendChild(badgeCountLabel);
	    div.appendChild(badgeCountInput);
	    div.appendChild(document.createElement('br'))
	    div.appendChild(bonusUpgradeLabel);
	    div.appendChild(bonusUpgradeInput);
    	div.classList.add('wayfarerrh__visible');

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

        collapsibleContent.appendChild(div);
        settingsContainer.appendChild(collapsibleInput);
        settingsContainer.appendChild(collapsibleLabel);
        settingsContainer.appendChild(collapsibleContent);

        const container = ref.parentNode.parentNode;
    	container.appendChild(settingsContainer);
	}

	function updateAgreementDisplay() {
		let countDiv = document.getElementById("totalcountnumber");
		if (countDiv !== null) {
			const {finished, total, available, progress} = stats;
			const newCount = getTotalAgreementCount(total, available, progress);
			const percent = ((newCount / finished)*100).toFixed(1);
    		countDiv.innerHTML = newCount + " (" + percent + "%)";
		}
	}

	function addCopyLink() {
		const ref = document.querySelector('app-rating-bar');
		var els = document.getElementsByClassName("profile-stats__section-title")

		if (!ref || els.length === 0) {
			if (tryNumber === 0) {
				document.querySelector('body')
					.insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Clippy Copy initialization failed, refresh page</strong></div>');
				return;
			}
			setTimeout(addCopyLink, 1000);
			tryNumber--;
			return;
		}


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

		const container = ref.parentNode;
		container.appendChild(div);

		CCButton = div;
    	CCButton.classList.add('wayfarercc__visible');

    	const parentRef = getStatsParent();
    	if (parentRef !== null) {
    		const totalparent = document.createElement('div');
    		let totaltext = document.createElement('div');
    		totaltext.innerHTML = "Processed & Agreement";
    		totaltext.classList.add("wayfarercc_text");

    		let totalcount = document.createElement('div');
    		totalcount.id = "totalcountnumber"
    		const {accepted, rejected, duplicated, finished, available, progress, total} = stats;
    		allAgreements = getTotalAgreementCount(total, available, progress);
    		const percent = ((allAgreements / finished)*100).toFixed(1);
    		totalcount.innerHTML = allAgreements + " (" + percent + "%)";
    		totalcount.classList.add("wayfarercc_count");

    		totalparent.appendChild(totaltext);
    		totalparent.appendChild(totalcount);
    		insertAfter(totalparent, parentRef);
    		totalparent.classList.add("profile-stats__stat");
    		totalparent.classList.add("wayfarercc_parent");
    	}
	}

	function getTotalAgreementCount(total, available, progress) {
		const countType = localStorage['wfcc_count_type_dropdown'];
		if (countType === "badgestat") {
			const userId = getUserId();
		    let badgeCount = localStorage["wfcc_badge_count_" + userId];
		    if (badgeCount === undefined || badgeCount === null || badgeCount === "" || badgeCount === "false" || isNaN(badgeCount)){
			    badgeCount = 0;
			}
			return badgeCount;
		} else {
			const userId = getUserId();
        	let bonusUpgrade = parseInt(localStorage["wfcc_bonus_upgrade_" + userId]);
        	if (bonusUpgrade === undefined || bonusUpgrade === null || bonusUpgrade === "" || bonusUpgrade === "false" || isNaN(bonusUpgrade)){
			    bonusUpgrade = 0;
			}
			return (total + available - bonusUpgrade) * 100 + progress;
		}
	}

	function insertAfter(newNode, referenceNode) {
	    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
	}

	function getStatsParent() {
		var els = document.getElementsByClassName("profile-stats__section-title");
		for (var i = 0; i < els.length; i++) {
       		const element = els[i];
       		if (element.innerHTML === "Agreements") {
       			return element;
       		}
       	}
       	console.log("element not found");
       	return null;
	}

	function exportStats() {
	  const {performance, finished, accepted, rejected, duplicated, available, progress, total} = stats;
	  let other = 0;
	  let total_agreements = 0;
	  const base_agreements = accepted + rejected + duplicated;

	  let count_type = localStorage['wfcc_count_type_dropdown'];
	  if (count_type === "badgestat") {
	  	count_type = "facts";
	  	total_agreements = base_agreements;
	  } else {
	  	count_type = "aprox";
	  	total_agreements = (total * 100) + progress;
	  	other = total_agreements - base_agreements;
	  }

	  const userId = getUserId();
      let badgeCount = localStorage["wfcc_badge_count_" + userId];
      if (badgeCount === undefined || badgeCount === null || badgeCount === "" || badgeCount === "false"){
	    badgeCount = 0;
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
		"upgrades_redeemed": total - available,
		"extended_type": count_type,
		"badge_count": badgeCount
	  }

	  navigator.clipboard.writeText(JSON.stringify(exportData));
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
			`;
		const style = document.createElement('style');
		style.type = 'text/css';
		style.innerHTML = css;
		document.querySelector('head').appendChild(style);
	}
}

init();

