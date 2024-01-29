// ==UserScript==
// @name         Wayfarer Translate
// @version      0.3.3
// @description  Add translate option to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-translate.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2024 AlfonsoML, tehstone, bilde
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
/* eslint indent: ['error', 4] */

function init() {
	let tryNumber = 15;

	let translateButton;
	let candidate;

	const SPACING = '\r\n\r\n';

	let engine = localStorage['translate-engine'];
	if (!engine) {
		engine = 'Google';
		localStorage['translate-engine'] = engine;
	}

	/**
	 * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
	 */
	(function (open) {
		XMLHttpRequest.prototype.open = function (method, url) {
			if (url == '/api/v1/vault/review') {
				if (method == 'GET') {
					this.addEventListener('load', parseCandidate, false);
				}
				if (method == 'POST') {
					hideButton();
				}
			}
			open.apply(this, arguments);
		};
	})(XMLHttpRequest.prototype.open);

	addCss();

	function parseCandidate(e) {
		try {
			const response = this.response;
			const json = JSON.parse(response);
			if (!json) {
				console.log(response);
				alert('Failed to parse response from Wayfarer');
				return;
			}
			// ignore if it's related to captchas
			if (json.captcha)
				return;

			if (json.code != 'OK')
				return;

			candidate = json.result;
			if (!candidate) {
				console.log(json);
				alert('Wayfarer\'s response didn\'t include a candidate.');
				return;
			}
			addTranslateButton();

		} catch (e)	{
			console.log(e); // eslint-disable-line no-console
		}

	}

	function getTranslatorLink() {
		switch (engine) {
			case 'Google':
				return 'https://translate.google.com/?sl=auto&q=';

			default:
				return 'https://www.deepl.com/translator#auto/' + navigator.language + '/';
		}
	}

	function createButton(ref) {
		if (!translateButton) {
			const div = document.createElement('div');
			div.className = 'wayfarertranslate';
			const link = document.createElement('a');
			link.className = '';
			link.title = 'Translate nomination';
			link.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04M18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12m-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';
			link.target = '_blank';

			const select = document.createElement('select');
			select.title = 'Select translation engine';
			const engines = [
				{name: 'Google', title: 'Google Translate'},
				{name: 'DeepL', title: 'DeepL Translate'}
			];

			select.innerHTML = engines.map(item => `<option value="${item.name}" ${item.name == engine ? 'selected' : ''}>${item.title}</option>`).join('');
			select.addEventListener('change', function () {
				engine = select.value;
				localStorage['translate-engine'] = engine;
				link.href = getTranslatorLink() + encodeURIComponent(link.dataset.text);
			});

			div.appendChild(link);
			div.appendChild(select);
			translateButton = div;
		}

		const container = ref.parentNode.parentNode;
		if (!container.contains(translateButton))
			container.appendChild(translateButton);
	}

	function addTranslateButton() {
		const ref = document.querySelector('wf-logo');

		if (!ref) {
			if (tryNumber === 0) {
				document.querySelector('body')
					.insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Translate initialization failed, refresh page</strong></div>');
				return;
			}
			setTimeout(addTranslateButton, 1000);
			tryNumber--;
			return;
		}

		let text = '';
		if (candidate.type == 'NEW' || candidate.type == 'NEW_B') {
			text = candidate.title + SPACING + candidate.description + SPACING + candidate.statement;
		}

		if (candidate.type == 'EDIT'|| candidate.type == 'EDIT_B') {
			const title = candidate.title || candidate.titleEdits.map(d=>d.value).join(SPACING);
			const description = candidate.description || candidate.descriptionEdits.map(d=>d.value).join(SPACING);
			text = title + SPACING + SPACING + description;
		}
		if (candidate.type == 'PHOTO'|| candidate.type == 'PHOTO_B') {
			text = candidate.title + SPACING + candidate.description;
		}

		if (text != '') {
			createButton(ref);
			const link = translateButton.querySelector('a');
			link.dataset.text = text;
			link.href = getTranslatorLink() + encodeURIComponent(text);
			translateButton.classList.add('wayfarertranslate__visible');
		}
	}

	function hideButton() {
		translateButton.classList.remove('wayfarertranslate__visible');
	}

	function addCss() {
		const css = `

			.wayfarertranslate {
				color: #333;
				margin-left: 2em;
				padding-top: 0.3em;
				text-align: center;
				display: none;
			}

			.wayfarertranslate__visible {
				display: inline;
			}

			.wayfarertranslate svg {
				width: 24px;
				height: 24px;
				filter: none;
				fill: currentColor;
				margin: 0 auto;
			}

			.dark .wayfarertranslate {
				color: #ddd;
			}

			.dark .wayfarertranslate select,
			.dark .wayfarertranslate option {
				background: #000;
			}
			`;
		const style = document.createElement('style');
		style.type = 'text/css';
		style.innerHTML = css;
		document.querySelector('head').appendChild(style);
	}

}

init();

