function renderStatus(statusText) {
	chrome.extension.sendMessage({msg: "show status", statusText: statusText});
	chrome.browserAction.setTitle({title: statusText});
}

function help() {
	renderStatus('Navigate to your IMDb profile page then click again');
}

function log(msg) {
	console.log(msg);
	renderStatus(msg);
	chrome.browserAction.setIcon({path: 'icon-working.png'});
}

function error(msg) {
	console.error(msg);
	renderStatus(msg);
	chrome.browserAction.setIcon({path: 'icon-error.png'});
}

function get(url) {
	return new Promise(function(resolve, reject) {
		var req = new XMLHttpRequest();
		req.open('GET', url);
		req.responseType = 'document';
		req.onload = function() {
			if (req.status == 200) {
				resolve(req.response);
			}
			else {
				reject(req.status);
			}
		};

		req.onerror = function() {
			reject(Error("Network Error"));
		};

		req.send();
	});
}

function getRetry(url, tries) {
	return get(url).catch(function(status) {
			error('Failed to get response: ' + status);
			if (--tries) {
				error('request failed; ' + tries + ' tries left');
				return getRetry(url, tries);
			}
			else {
				throw 'Failed too many times';
			}
	});
}

function sleep(timeInMs) {
	var now = new Date().getTime();
	while(new Date().getTime() < now + timeInMs);
}

function downloadMessage(url) {
	var postId = url.substring(url.lastIndexOf('#') + 1, url.length);

	return getRetry(url, 10).then(function(r) {
		msg = r.getElementById('comment-' + postId);
		if (!msg) {
			throw 'Message text not found in page: ' + postId;
		}
		links = r.getElementsByTagName('h1');
		if (links.length != 1) {
			throw 'Failed to parse board title';
		}
		html = '<div class="post">' + links[0].outerHTML + msg.outerHTML + '</div>';
		return html;
	}).catch(function(err) {
		// ignore failed message download
		error('FAILED: ' + url);
		error('error: ' + err);
	});
}

var gResults;
function downloadPage(url) {
	return getRetry(url, 10).then(function(r) {
		var links = r.getElementsByTagName('a');
		var urls = [];
		for (var i = 0; i < links.length; i++) {
			var url = links[i].href;
			if (url.startsWith('http://www.imdb.com/') && url.includes('/thread/')
					&& url.includes('#')) {
				urls.push(url);
			}
		}
		// No message link found means we're beyond the last page
		if (urls.length == 0) throw 'finished';
		else
			log('Msgs in page: ' + urls.length);

		return urls.reduce(function(sequence, url) {
			//log(url);
			return sequence.then(function() {
				return downloadMessage(url);
			}).then(function(msg) {
				gResults.push(msg);
				log('Msgs crawled: ' + gResults.length);
			}).catch(function (err) {
				// ignore parsing error
				error(err);
			});
		}, Promise.resolve());
	}).then(function() {
		return url;
	});
}

function finishDownload() {
	html = '<html><title>IMDb message board backup</title><body>\n' +
		gResults.reduce(function(a, b) {return a+b;}) +
		'</body></html>';
	url = 'data:text/html,' + html;
	log(url);
	chrome.downloads.download({url:url, filename: 'imdbBackup.html'});
	log('Finished! Bye IMDb!');
	setDownloadStatus(false);
	chrome.browserAction.setIcon({path: 'icon-done.png'});
}

function continueDownload(url) {
	cut = url.lastIndexOf('=');
	page = parseInt(url.substring(cut + 1, url.length)) + 1;
	url = url.substring(0, cut + 1) + page;
	log('Parsing page ' + (page+1));
	return downloadPage(url).then(function(u) {
		continueDownload(u);
	}).catch(function(err) {
		if (err == 'finished') {
			log('finished');
			return finishDownload();
		}
		else {
			alert('derp?');
			throw err;
		}
	});
}

function startDownload(url) {
	if (!setDownloadStatus(true)) {
		error('Existing download still in progress!');
		return;
	}
	gDownloading = true;

	// initialize result
	gResults = [];

	url = url.substring(0, url.lastIndexOf('/') + 1);
	if (!url.endsWith('/boards/')) url += 'boards/';
	var a = document.createElement('a');
	if (!url.startsWith('http://www.imdb.com/user/ur')) {
		help();
		setDownloadStatus(false);
		return;
	}
	log('URL: ' + url);
	downloadPage(url + '?uc=0').then(function(url) {
				continueDownload(url);
			}).catch(function(err) {
				error(err);
				setDownloadStatus(false);
			});
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

var gDownloading = false;
function setDownloadStatus(status) {
	if (gDownloading && status) {
		return false;
	}
	gDownloading = status;
	return true;
}

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
			if (request.msg == "start download") {
				startDownload(request.url);
			}
});

