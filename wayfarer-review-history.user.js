// ==UserScript==
// @name         Wayfarer RH
// @version      0.2.0
// @description  Add local review history storage to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-rh
// @downloadURL  https://github.com/tehstone/wayfarer-rh/raw/main/wayfarer-rh.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-rh
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */

function init() {
  let candidate;
  let userReview;
  let tryNumber = 10;

  let selection = localStorage['wfrh_review_type_dropdown'];
  if (!selection) {
    selection = 'wfrhSaved_';
    localStorage['wfrh_review_type_dropdown'] = selection;
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

  /**
   * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
   */
  (function (open) {
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url == '/api/v1/vault/review') {
        if (method == 'GET') {
          this.addEventListener('load', parseCandidate, false);
        }
      }
      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

  !function(send){
    XMLHttpRequest.prototype.send = function (data) {
      if (data) {
        parseReview(data);
      }
        send.call(this, data);
    }
  }(XMLHttpRequest.prototype.send);

  function parseCandidate(e) {
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

      candidate = json.result;
      if (!candidate) {
        alert('Wayfarer\'s response didn\'t include a candidate.');
        return;
      }
      addCss();
      saveReviewInfo();
      addRHButtons();

    } catch (e) {
      console.log(e); // eslint-disable-line no-console
    }
  }

  function addRHButtons() {
    const userId = getUserId();
    const ref = document.querySelector('wf-logo');

    if (!ref) {
      if (tryNumber === 0) {
        document.querySelector('body')
          .insertAdjacentHTML('afterBegin', '<div class="alert alert-danger"><strong><span class="glyphicon glyphicon-remove"></span> Wayfarer Review History initialization failed, refresh page</strong></div>');
        return;
      }
      setTimeout(addTranslateButton, 1000);
      tryNumber--;
      return;
    }

    const testelem = document.getElementById("wayfarerrhexport");
    if (testelem !== null) {
      return;
    }

    const div = document.createElement('div');
    div.className = 'wayfarerrh';
    let exportButton = document.createElement('button');
    exportButton.innerHTML = "Export";
    exportButton.onclick = function() {
      exportReviewHistory();
    }
    exportButton.classList.add('wayfarerrh__button');
    exportButton.id = "wayfarerrhexport";

    let clearButton = document.createElement('button');
    clearButton.innerHTML = "Reset";
    clearButton.onclick = function() {
      clearReviewHistory();
    }
    clearButton.classList.add('wayfarerrh__button');

    const select = document.createElement('select');
    select.title = "Select review type";
    const reviewTypes = [
      {name: "wfrhSaved_", title: "New Candidates"},
      {name: "wfrhSavedEdits_", title: "Edit Reviews"},
      {name: "wfrhSavedPhotos_", title: "Photo Reviews"}
    ];
    select.innerHTML = reviewTypes.map(item => `<option value="${item.name}" ${item.name == selection ? 'selected' : ''}>${item.title}</option>`).join('');
    select.addEventListener('change', function () {
      selection = select.value;
      localStorage['wfrh_review_type_dropdown'] = selection;
    });

    const dl = document.createElement('a');
    dl.id = "downloadAnchorElem"
    dl.classList.add('wayfarerrh__hiddendl');

    div.appendChild(exportButton);
    div.appendChild(clearButton);
    div.appendChild(document.createElement('br'))
    div.appendChild(select);
    div.appendChild(dl);

    const container = ref.parentNode.parentNode;
    container.appendChild(div);

    RHButtons = div;
    RHButtons.classList.add('wayfarerrh__visible');
  }

  function exportReviewHistory() {
    const userId = getUserId();
    const key = selection + userId;
    let reviewData = localStorage[key];
    if (reviewData === undefined || reviewData === null || reviewData === "" || reviewData === "false"){
      alert("There is no saved data to export.");
      return;
    }

    const blob = new Blob([reviewData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    let dlAnchorElem = document.getElementById('downloadAnchorElem');
    dlAnchorElem.setAttribute("href",     url     );
    dlAnchorElem.setAttribute("download", key+".json");
    dlAnchorElem.click();

  }

  function clearReviewHistory() {
    let revtype = "nomination review";
    if (selection === "wfrhSavedEdits_") {
      revtype = "edit review"
    }
    if (selection === "wfrhSavedPhotos_") {
      revtype = "photo review"
    }
    if (confirm('Your saved ' + revtype + ' history will be cleared. Are you sure you want to do this?', '') == false) {
      return;
    }

    const userId = getUserId();
    key = selection + userId;
    localStorage[key] = [];
  }
    

  function parseReview(data) {
    try {
      // const json = JSON.parse(request);
      // if (!json) {
      //   console.log(request);
      //   alert('Failed to parse request to Wayfarer');
      //   return;
      // }
      // // ignore if it's related to captchas
      // if (json.captcha)
      //   return;

      const userReview = JSON.parse(data);
      const type = userReview["type"];
      let edit = false;
      let photo = false;

      if (type === null) {
        return;
      } 
      if (type == "EDIT") {
        edit = true;
      }
      if (type == "PHOTO") {
        photo = true;
      }

      let reviewHistory = getReviewHistory(edit, photo);

      if (!userReview) {
        alert('Wayfarer\'s response didn\'t include a candidate.');
        return;
      }
      const lastItem = reviewHistory.length ? reviewHistory[reviewHistory.length - 1] : null;
      const isSameReview = lastItem && lastItem.id && lastItem.id === userReview.id || false;
      if (isSameReview) {
        // update the result
        lastItem.review = userReview;
        reviewHistory[reviewHistory.length - 1] = lastItem;
      } else {
        // do nothing for now
      }
      saveUserHistory(reviewHistory, edit, photo);
    } catch (e) {
      console.log(e); // eslint-disable-line no-console
    }

  }

  function getReviewHistory(edit, photo) {
    let reviewHistory = [];
    const userId = getUserId();
    let ret = "";
    if (edit) {
      ret = localStorage["wfrhSavedEdits_" + userId];
    } else if (photo) {
      ret = localStorage["wfrhSavedPhotos_" + userId];
    } else {
      ret = localStorage["wfrhSaved_" + userId];
    }
    if (ret === undefined || ret === null || ret === "" || ret === "false"){
      reviewHistory = [];
    } else{
      reviewHistory = JSON.parse(ret);
    }
    return reviewHistory;
  }

  function saveUserHistory(reviewHistory, edit, photo) {
    const userId = getUserId();
    let key = "wfrhSaved_" + userId;
    let value = JSON.stringify(reviewHistory);
    if (edit) {
      key = "wfrhSavedEdits_" + userId;
    } else if (photo) {
      key = "wfrhSavedPhotos_" + userId;
    }
    try{
    //Do a simple save, this will throw an exception if the localStorage is full
      localStorage[key] = value;
    } catch (e) {
      alert("Local storage full, unable to save review history")
    }
  }

  function saveReviewInfo() {
    const ref = document.querySelector('wf-logo');

    let reviewHistory = [];
    let saveData = {};
    let edit = false;
    let photo = false;

    if (candidate.type == 'NEW') {
      const {id, title, description, lat, lng, imageUrl, statement, supportingImageUrl} = candidate;
      saveData = {
        id,
        title,
        description,
        imageUrl,
        lat,
        lng,
        statement,
        supportingImageUrl,
        ts: +new Date(),
      }
    }

    if (candidate.type == 'EDIT') {
      edit = true;
      const {id, title, description, descriptionEdits, titleEdits, locationEdits} = candidate;
      saveData = { 
        id,
        title,
        description, 
        descriptionEdits, 
        titleEdits, 
        locationEdits
      }      
    }

    if (candidate.type == 'PHOTO') {
      photo = true;
      const {id, title, description, lat, lng, newPhotos} = candidate;
      saveData = { 
        id,
        title,
        description,
        lat, 
        lng,
        newPhotos
      }
    }

    reviewHistory = getReviewHistory(edit, photo);

    const lastItem = reviewHistory.length ? reviewHistory[reviewHistory.length - 1] : null;
    const isSameReview = lastItem && lastItem.id && lastItem.id === saveData.id || false;
    if (!isSameReview) {
      reviewHistory.push(saveData);
    }
    
    saveUserHistory(reviewHistory, edit, photo);
  }

  function addCss() {
    const css = `

      .wayfarerrh {
        color: #333;
        margin-left: 2em;
        padding-top: 0.3em;
        text-align: center;
        display: none;
      }

      .wayfarerrh__visible {
        display: block;
      }

      .dark .wayfarerrh {
        color: #ddd;
      }

      .wayfarerrh__button {
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

      .wayfarerrh__hiddendl {
        display: none;
      }
      `;
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    document.querySelector('head').appendChild(style);
  }

}

init();

