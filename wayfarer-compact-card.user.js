	// ==UserScript==
	// @name         Wayfarer Compact Card Reviewing
	// @version      0.0.1
	// @description  Add compact card reviewing
	// @namespace    https://github.com/tehstone/wayfarer-addons/
	// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-compact-card.user.js
	// @homepageURL  https://github.com/tehstone/wayfarer-addons/
	// @match        https://wayfarer.nianticlabs.com/*
	// ==/UserScript==

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
				if (url == '/api/v1/vault/review') {
					if (method == 'GET') {
						this.addEventListener('load', checkResponse, false);
					}
				}
				open.apply(this, arguments);
			};
		})(XMLHttpRequest.prototype.open);

		addCss();

		function checkResponse(e) {
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

				nominations = json.result;
				if (!nominations) {
					alert('Wayfarer\'s response didn\'t include nominations.');
					return;
				}
				//applyUiMods();

			} catch (e)	{
				console.log(e); // eslint-disable-line no-console
			}

		}

		function applyUiMods() {
			const ref = document.querySelector('app-should-be-wayspot');

			if (!ref) {
				if (tryNumber === 0) {
					document.querySelector('body')
						.insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Clippy Copy initialization failed, refresh page</strong></div>');
					return;
				}
				setTimeout(applyUiMods, 1000);
				tryNumber--;
				return;
			}

			const divNames = {
				shouldBePortal: document.querySelector('app-should-be-wayspot'),
				titleAndDescription: document.querySelector('app-title-and-description'), 
				duplicates: document.querySelector('app-check-duplicates'), 
				historicOrCultural: document.querySelector('app-historic-cultural-significance'), 
				visuallyUnique: document.querySelector('app-visually-unique'), 
				safeAccess: document.querySelector('app-safe-access'), 
				location: document.querySelector('app-location-accuracy'), 
				whatIsIt: document.querySelector('app-review-categorization'), 
				additionalComment: document.querySelector('app-review-comments'),
				supportingInfo: document.querySelector('app-supporting-info')
			};

			divNames.shouldBePortal.children[0].children[0].children[0].children[1].style.display = "none";
			divNames.supportingInfo.children[0].children[0].children[0].children[1].style.display = "none";

			var fragment = document.createDocumentFragment();
			//fragment.appendChild(divNames.titleAndDescription);
			//fragment.style["flex-direction"] = "column";
			//fragment.style.display = "flex";
			let outer = document.createElement("div");
			outer.style.display = "flex";
			outer.style["flex-direction"] = "column";
			outer.appendChild(divNames.titleAndDescription);
			let threeCard = document.createElement("div");
			threeCard.style.height = "50%";
			threeCard.style.display = "flex";
			threeCard.style["flex-direction"] = "column";
			outer.appendChild(threeCard);
			fragment.appendChild(outer);
			//supportingInfo.parentNode
			insertAfter(fragment, divNames.shouldBePortal);
		    //document.querySelector('body > app-root > app-wayfarer > div > mat-sidenav-container > mat-sidenav-content > div > app-review > div:nth-child(2) > app-review-new > div > div').appendChild(fragment);
		    divNames.titleAndDescription.classList.remove("card--expand");
		    divNames.titleAndDescription.style.padding = "0pt";
		    divNames.titleAndDescription.classList.add("small-card");
		    divNames.titleAndDescription.style.height = "50%";
		    divNames.titleAndDescription.children[0].children[0].children[0].children[0].innerText = "Title/Description";
		    divNames.titleAndDescription.getElementsByClassName('wf-review-card')[0].style.paddingTop = "0pt";
		    divNames.titleAndDescription.children[0].children[0].children[0].children[1].style.display = "none";
		    divNames.titleAndDescription.children[0].children[0].children[0].children[0].style.fontSize = "16pt";
		    divNames.titleAndDescription.children[0].children[0].children[0].children[0].style.margin = "0pt";
		    divNames.titleAndDescription.children[0].children[1].children[0].style.padding = "0pt";
		    divNames.titleAndDescription.getElementsByClassName("wf-rate")[0].style.marginBottom = "-1em";
		    divNames.titleAndDescription.getElementsByClassName("wf-rate")[0].style.marginTop = "-0.2em";
		    divNames.titleAndDescription.children[0].classList.remove("wf-review-card");
		    
		    const titleHeader = divNames.titleAndDescription.children[0].children[0];
		    const titleBody = divNames.titleAndDescription.children[0].children[1];
		    const titleReview = divNames.titleAndDescription.children[0].children[2];
		    titleHeader.classList.remove("wf-review-card__header");
		    titleReview.classList.remove("wf-review-card__footer");
		    titleHeader.style.width = "50%";
		    titleReview.style.width = "50%";
		    let titleHeadBox = document.createElement("div");
		    titleHeadBox.style.display = "flex";
		    titleHeadBox.style["flex-direction"] = "row";
		    titleHeadBox.style.margin = "5pt";
		    titleHeadBox.appendChild(titleHeader);
		    titleHeadBox.appendChild(titleReview);
		    divNames.titleAndDescription.children[0].insertBefore(titleHeadBox, titleBody);
		    //insertAfter(titleBox, divNames.titleAndDescription.children[0].children[2]);

		    divNames.historicOrCultural.classList.add("middle-card");
		    divNames.visuallyUnique.classList.remove("middle-card");
		    divNames.safeAccess.classList.add("middle-card");

		    divNames.historicOrCultural.children[0].children[0].children[0].children[0].style.padding = "0pt";
		    divNames.historicOrCultural.children[0].children[0].children[0].children[0].style.margin = "5.5pt 0pt -1pt";
		    divNames.historicOrCultural.children[0].children[0].children[0].children[1].style.display = "none";
		    divNames.historicOrCultural.children[0].children[1].style.display = "none";
		    divNames.historicOrCultural.children[0].children[0].style.marginBottom = "-20pt";
		    divNames.historicOrCultural.children[0].children[0].style.minHeight = "-6pt";
		    divNames.historicOrCultural.style.maxHeight = "3em";
		    divNames.visuallyUnique.children[0].children[0].children[0].children[0].style.padding = "0pt";
		    divNames.visuallyUnique.children[0].children[0].children[0].children[0].style.margin = "5.5pt 0pt -1pt";
		    divNames.visuallyUnique.children[0].children[0].children[0].children[1].style.display = "none";
		    divNames.visuallyUnique.children[0].children[1].style.display = "none";
		    divNames.visuallyUnique.children[0].children[0].style.marginBottom = "-20pt";
		    divNames.visuallyUnique.children[0].children[0].style.marginTop = "-6pt";
		    divNames.visuallyUnique.style.maxHeight = "3em";
		    divNames.safeAccess.children[0].children[0].children[0].children[0].style.padding = "0pt";
		    divNames.safeAccess.children[0].children[0].children[0].children[0].style.margin = "5.5pt 0pt -1pt";
		    divNames.safeAccess.children[0].children[0].children[0].children[1].style.display = "none";
		    divNames.safeAccess.children[0].children[1].style.display = "none";
		    divNames.safeAccess.children[0].children[0].style.marginBottom = "-20pt";
		    divNames.safeAccess.children[0].children[0].style.marginTop = "-6pt";
		    divNames.safeAccess.style.maxHeight = "3em";

		    divNames.historicOrCultural.children[0].children[0].children[0].children[0].innerText = "Historic/Cultural";

		    threeCard.appendChild(divNames.historicOrCultural);
		    threeCard.appendChild(divNames.visuallyUnique);
		    threeCard.appendChild(divNames.safeAccess);

		    divNames.duplicates.classList.remove("card--double-width");
		    divNames.duplicates.classList.add("card--expand");
		    divNames.duplicates.style.order = 4;

		    divNames.location.classList.remove("card--double-width");
		    divNames.location.classList.add("card--expand");
		    divNames.location.style.order = 6;

		    threeCard.style.order = 2;
		    divNames.titleAndDescription.style.order = 1;
		    divNames.historicOrCultural.style.order = 2;
		    divNames.visuallyUnique.style.order = 3;
		    divNames.safeAccess.style.order = 4;
		    divNames.whatIsIt.style.order = 7;
		    divNames.whatIsIt.style.minWidth = "40%";

		    divNames.historicOrCultural.children[0].children[0].classList.remove("wf-review-card__header");
		    divNames.visuallyUnique.children[0].children[0].classList.remove("wf-review-card__header");
		    divNames.safeAccess.children[0].children[0].classList.remove("wf-review-card__header");		    
		    divNames.historicOrCultural.children[0].children[2].classList.remove("wf-review-card__footer");
		    divNames.visuallyUnique.children[0].children[2].classList.remove("wf-review-card__footer");
		    divNames.safeAccess.children[0].children[2].classList.remove("wf-review-card__footer");
		    divNames.titleAndDescription.children[0].classList.remove('card');
		    divNames.historicOrCultural.children[0].classList.remove('card');
		    divNames.visuallyUnique.children[0].classList.remove('card');
		    divNames.safeAccess.children[0].classList.remove('card');
		}

		function insertAfter(newNode, referenceNode) {
		    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
		}

		function addCss() {
			const css = `
				.translateButton{
				    border: 2pt solid white;
				    border-radius: 2pt;
				    width: 17pt;
				    background-color: white;
				    display: block;
				    height: 17pt;
				    background-size: contain;
				    background-repeat: no-repeat;
				    background-position: center;
				    margin-bottom: 5pt;
				    box-shadow: 0 0 2px grey;
				}

				.customMapButton{
				    display: inline-block;
				    background: white;
				    padding: 5pt;
				    border-radius: 3pt;
				    position: relative;
				    margin: 5pt;
				    color: black;
				    box-shadow: 2pt 2pt 3pt grey;
				    transition: box-shadow 0.2s;
				}

				.customMapButton:hover{
					background-color: #F0F0F0;
					color: black;
				    box-shadow: 1pt 1pt 3pt grey;
				}

				.five-star-rating{
				    border: rgba(0,0,0,0) dashed 2pt;
				}

				html {
				  scroll-behavior: smooth;
				}

				.presetBox{
				    background: white;
				    border-radius: 0.2em;
				    padding: 0.3em;
				}

				.presetButton{
					margin-left: 1em;
				    background: white;
				    border-radius: 0.3em;
				    border: black solid 1px;
				}

				.presetAddButton{
				    border-radius: 0.3em;
				    border: none;
				    margin-left: 0.5em;
				    margin-right: 1em;
				}

				.three-card-parent .small-card{
				    max-height: 10.08em;    
				}

				/* Open in drop down CSS */
				.dropbtn {
				  background-color: #4CAF50;
				  color: white;
				  padding: 16px;
				  font-size: 16px;
				  border: none;
				  cursor: pointer;
				}

				.mapsDropdown {
				  float: left;
				  background-color: white;
				  border-radius: 5px;
				  box-shadow: grey 2px 2px 10px;
				  margin-bottom: .5em;
				  font-size: 1.1em;
				  color: black;
				  padding: .25em;
				  width: 7em;
				  text-align: center;
				}

				.dropdown-content {
				  display: none;
				  position: absolute;
				  /* left: -.25em; */
				  transform: translateY(-100%);
				  border-radius: 5px;
				  background-color: #f9f9f9;
				  min-width: 160px;
				  box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
				  z-index: 9001;
				}

				.dropdown-content a {
				  color: black;
				  padding: 12px 16px;
				  text-decoration: none;
				  display: block;
				}

				.dropdown-content a:hover {
				  background-color: #f1f1f1
				  border-radius: 5px;
				}

				.mapsDropdown:hover .dropdown-content {
				  display: block;
				}

				.mapsDropdown:hover .dropbtn {
				  background-color: #3e8e41;
				}

				.error-message__autoretry {
				  margin-top: 20px;
				}

				.error-message__autoretry i {
				  margin-right: 10px;
				  -webkit-animation: rotating 2s linear infinite;
				  -moz-animation: rotating 2s linear infinite;
				  -ms-animation: rotating 2s linear infinite;
				  -o-animation: rotating 2s linear infinite;
				  animation: rotating 2s linear infinite;
				}

				@-webkit-keyframes rotating /* Safari and Chrome */ {
				  from {
				    -webkit-transform: rotate(0deg);
				    -o-transform: rotate(0deg);
				    transform: rotate(0deg);
				  }
				  to {
				    -webkit-transform: rotate(360deg);
				    -o-transform: rotate(360deg);
				    transform: rotate(360deg);
				  }
				}
				@keyframes rotating {
				  from {
				    -ms-transform: rotate(0deg);
				    -moz-transform: rotate(0deg);
				    -webkit-transform: rotate(0deg);
				    -o-transform: rotate(0deg);
				    transform: rotate(0deg);
				  }
				  to {
				    -ms-transform: rotate(360deg);
				    -moz-transform: rotate(360deg);
				    -webkit-transform: rotate(360deg);
				    -o-transform: rotate(360deg);
				    transform: rotate(360deg);
				  }
				}

				#wfpNotify{
				    position: absolute;
				    bottom: 1em;
				    right: 1em;
				    width: 30em;
				    z-index: 100;
				}

				.wfpNotification{
				    border-radius: 0.5em;
				    background-color: #3e8e41CC;
				    padding: 1em;
				    margin-top: 1.5em;
				    color: white;
				}

				.wfpNotifyCloseButton{
				    float: right;
				}

				/* Vanilla Dark Mode support */
				.theme--dark  .presetBox{
				    color: black;
				}
				`;
			const style = document.createElement('style');
			style.type = 'text/css';
			style.innerHTML = css;
			document.querySelector('head').appendChild(style);
		}
	}

	init();

