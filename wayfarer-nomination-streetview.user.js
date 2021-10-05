// ==UserScript==
// @name         Wayfarer Nomination Streetview
// @version      0.2.0
// @description  Add Streetview to selected nomination
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-streetview.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */

function init() {
	let tryNumber = 10;
	let selected;

	/**
	 * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
	 */
	(function (open) {
		XMLHttpRequest.prototype.open = function (method, url) {
			if (url == '/api/v1/vault/manage/detail') {
				if (method == 'POST') {
					this.addEventListener('load', parseSelected, false);
				}
			}
			open.apply(this, arguments);
		};
	})(XMLHttpRequest.prototype.open);

	addCss();

	function parseSelected(e) {
		tryNumber = 10;
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

			selected = json.result;
			if (!selected) {
				alert('Wayfarer\'s response didn\'t include a candidate.');
				return;
			}
			
			addCoordinates();
			addStreetView();

		} catch (e)	{
			console.log(e); // eslint-disable-line no-console
		}

	}

	function addCoordinates() {
		const lat = selected["lat"];
        const lng = selected["lng"];
        const city = selected["city"];
        const state = selected["state"];

        let panel = null;
        panel = document.querySelector("body > app-root > app-wayfarer > div > mat-sidenav-container > mat-sidenav-content > div > app-nominations > div.nominations.ng-star-inserted > app-details-pane > div > div > div > p");
        if (panel !== null) {
	    	const coordinates = lat + "," + lng;
	    	const newText = city + " " + state + " " + " (" + coordinates + ")";
	    	panel.innerText = newText;

	    	panel.onclick = function() {
				navigator.clipboard.writeText(coordinates);
			}
		}
	}

	function addStreetView() {
		if (typeof(google) === 'undefined') {
            setTimeout(addStreetView, 100);
            return;
        }

        const ref = document.querySelector('wf-page-header');

		if (!ref) {
			if (tryNumber === 0) {
				document.querySelector('body')
					.insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Clippy Copy initialization failed, refresh page</strong></div>');
				return;
			}
			setTimeout(addStreetView, 1000);
			tryNumber--;
			return;
		}

		if (document.getElementById("pano") === null){
            let lastPane = document.getElementsByClassName("details-pane__map")[0];
            if (lastPane === undefined){
                console.log("failed to find attach elem");
                return;
            }
            let SVMapElement = document.createElement("div");
            SVMapElement.id = "pano";
            SVMapElement.style.height = "480px";
            SVMapElement.style.marginTop = "10px";
            lastPane.parentElement.insertBefore(SVMapElement, lastPane.nextSibling);
        }

        var lat = selected["lat"];
        var lng = selected["lng"];

        SVMap = new google.maps.Map(document.getElementById("pano"),{
            center: {
                lat: lat,
                lng: lng
            },
            mapTypeId: "hybrid",
            zoom: 17,
            scaleControl: true,
            scrollwheel: true,
            gestureHandling: 'greedy',
            mapTypeControl: false
        });
        var marker = new google.maps.Marker({
            map: SVMap,
            position: {
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            },
            title: selected["title"]
        });
        var panorama = SVMap.getStreetView();
        var client = new google.maps.StreetViewService;
        client.getPanoramaByLocation({
            lat: lat,
            lng: lng
        }, 50, function(result, status) {
            if (status === "OK") {
                var point = new google.maps.LatLng(lat,lng);
                var oldPoint = point;
                point = result.location.latLng;
                var heading = google.maps.geometry.spherical.computeHeading(point, oldPoint);
                panorama.setPosition(point);
                panorama.setPov({
                    heading: heading,
                    pitch: 0,
                    zoom: 1
                });
                panorama.setMotionTracking(false);
                panorama.setVisible(true);
            }
        });
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
			.wayfarernd {
				color: #333;
				margin: 5px 50px;
				padding: 5px 20px;
				text-align: left;
				font-size: 16px;
				background-color: #e5e5e5;
				border: 1px;
				border-radius: 3px;
				border-style: double;
				border-color: #ff4713;
				height: 25%
			}

			.wayfarercc__visible {
				display: block;
			}

			.dark .wayfarernd {
				color: #000000;
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

