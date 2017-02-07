function renderStatus(statusText) {
	document.getElementById('status').textContent = statusText;
}

function getCurrentTabUrl(callback) {
  var queryInfo = {
    active: true,
    currentWindow: true
  };

  chrome.tabs.query(queryInfo, function(tabs) {
    var tab = tabs[0];
    var url = tab.url;
    callback(url);
  });
}

chrome.extension.onMessage.addListener(function(request) {
			if (request.msg == "show status") {
				renderStatus(request.statusText);
			}
});

document.addEventListener('DOMContentLoaded', function() {
		getCurrentTabUrl(function(url) {
			chrome.extension.sendMessage({msg: "start download", url: url});
		});
});
