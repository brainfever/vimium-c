"use strict";
var Clipboard = {
  getTextArea: function() {
    var el = document.createElement("textarea");
    el.style.position = "absolute";
    el.style.left = "-99px";
    el.style.width = "0";
    this.getTextArea = function() { return el; };
    return el;
  },
  tailSpacesRe: /[ \t]+\n/g,
  format: function(data) {
    data = data.replace(Utils.A0Re, " ").replace(this.tailSpacesRe, "\n");
    var i = data.charCodeAt(data.length - 1);
    if (i !== 32 && i !== 9) {
    } else if (i = data.lastIndexOf('\n') + 1) {
      data = data.substring(0, i) + data.substring(i).trimRight();
    } else if ((i = data.charCodeAt(0)) !== 32 && i !== 9) {
      data = data.trimRight();
    }
    return data;
  },
  copy: function(data) {
    data = this.format(data);
    var textArea = this.getTextArea();
    textArea.value = data;
    document.documentElement.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
    textArea.value = "";
  },
  paste: function() {
    var textArea = this.getTextArea(), value;
    document.documentElement.appendChild(textArea);
    textArea.focus();
    document.execCommand("paste");
    value = textArea.value;
    textArea.remove();
    textArea.value = "";
    return value.replace(Utils.A0Re, " ");
  }
},
Marks = { // NOTE: all members should be static
  createMark: function(request, port) {
    var tabId = port.sender.tabId;
    if (request.scroll) {
      localStorage.setItem(Marks.getLocationKey(request.markName), JSON.stringify({
        tabId: tabId,
        url: request.url,
        scroll: request.scroll
      }));
      return true;
    }
    (port = Settings.indexFrame(tabId, 0) || port) && port.postMessage({
      name: "createMark",
      markName: request.markName,
    });
  },
  gotoMark: function(request) {
    var str, markInfo;
    str = localStorage.getItem(Marks.getLocationKey(request.markName));
    if (!str) {
      return false;
    }
    markInfo = JSON.parse(str);
    markInfo.markName = request.markName;
    markInfo.prefix = request.prefix !== false && request.scroll[0] === 0 && request.scroll[1] === 0;
    if (Settings.indexPorts(markInfo.tabId)) {
      chrome.tabs.get(markInfo.tabId, Marks.checkTab.bind(markInfo));
    } else {
      g_requestHandlers.focusOrLaunch(markInfo);
    }
    return true;
  },
  checkTab: function(tab) {
    var url = tab.url.split("#", 1)[0];
    if (url === this.url || this.prefix && this.url.startsWith(url)) {
      g_requestHandlers.gotoSession({ sessionId: tab.id });
      Marks.scrollTab(this, tab);
    } else {
      g_requestHandlers.focusOrLaunch(this);
    }
  },
  getLocationKey: function(keyChar) {
    return "vimiumGlobalMark|" + keyChar;
  },
  scrollTab: function(markInfo, tab) {
    var tabId = tab.id, port;
    (port = Settings.indexFrame(tabId, 0)) && port.postMessage({
      name: "scroll",
      scroll: markInfo.scroll,
      markName: markInfo.markName
    });
    if (markInfo.tabId !== tabId && markInfo.markName) {
      localStorage.setItem(Marks.getLocationKey(markInfo.markName), JSON.stringify({
        tabId: tabId,
        url: markInfo.url,
        scroll: markInfo.scroll
      }));
    }
  },
  clearGlobal: function() {
    var key_start, storage, i, key;
    key_start = Marks.getLocationKey("");
    storage = localStorage;
    for (i = storage.length; 0 <= --i; ) {
      key = storage.key(i);
      if (key.startsWith(key_start)) {
        storage.removeItem(key);
      }
    }
    return g_requestHandlers.ShowHUD("Global marks have been cleared.");
  }
},
HelpDialog = {
  render: function(showUnbound, showNames, customTitle) {
    var command, commandsToKey, key, ref = Commands.keyToCommandRegistry, result;
    commandsToKey = {};
    for (key in ref) {
      command = ref[key].command;
      (commandsToKey[command] || (commandsToKey[command] = [])).push(key);
    }
    showUnbound = !!showUnbound;
    showNames = !!showNames;
    result = Object.setPrototypeOf({
      version: Settings.CONST.CurrentVersion,
      title: customTitle || "Help",
      tip: showNames ? "Tip: click command names to yank them to the clipboard." : "",
      lbPad: showNames ? '\n\t\t<tr class="HelpTr"><td class="HelpTd TdBottom">&#160;</td></tr>' : ""
    }, null);
    return Settings.cache.helpDialog.replace(/\{\{(\w+)}}/g, function(_, group) {
      var s = result[group];
      return s != null ? s
        : HelpDialog.groupHtml(group, commandsToKey, Commands.availableCommands, showUnbound, showNames);
    });
  },
  groupHtml: function(group, commandsToKey, availableCommands, showUnbound, showNames) {
    var bindings, command, html, isAdvanced, _i, _len, _ref, keys, description, push;
    html = [];
    _ref = Commands.commandGroups[group];
    showNames = showNames || "";
    Utils.escapeText("");
    push = HelpDialog.commandHtml;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      command = _ref[_i];
      if (!(keys = commandsToKey[command]) && !showUnbound) { continue; }
      if (keys && keys.length > 0) {
        bindings = '\n\t\t<span class="HelpKey">' + keys.map(Utils.escapeText).join('</span>, <span class="HelpKey">') + "</span>\n\t";
      } else {
        bindings = "";
      }
      isAdvanced = command in Commands.advancedCommands;
      description = availableCommands[command][0];
      if (!bindings || keys.join(", ").length <= 12) {
        push(html, isAdvanced, bindings, description, showNames && command);
      } else {
        push(html, isAdvanced, bindings, "", "");
        push(html, isAdvanced, "", description, showNames && command);
      }
    }
    return html.join("");
  },
  commandHtml: function(html, isAdvanced, bindings, description, command) {
    html.push('<tr class="HelpTr', isAdvanced ? " HelpAdv" : "", '">\n\t');
    if (description) {
      html.push('<td class="HelpTd HelpKeys">'
        , bindings, '</td>\n\t<td class="HelpTd HelpCommandInfo">'
        , description);
      if (command) {
        html.push('\n\t\t<span class="HelpCommandName" role="button">('
          , command, ")</span>\n\t");
      }
    } else {
      html.push('<td class="HelpTd HelpKeys HelpLongKeys" colspan="2">'
        , bindings);
    }
    html.push("</td>\n</tr>\n");
  }
},
TabRecency = {
  tabs: null,
  last: function() { return -1; },
  rCompare: null,
};

setTimeout(function() {
  var cache = Object.create(null), last = -1, stamp = 1, time = 0,
  _this = TabRecency,
  clean = function() {
    var ref = cache, i;
    for (i in ref) {
      if (ref[i] <= 896) { delete ref[i]; }
      else {ref[i] -= 895; }
    }
    stamp = 128;
  },
  listener = function(activeInfo) {
    var now = Date.now(), tabId = activeInfo.tabId;
    if (now - time > 500) {
      cache[last] = ++stamp;
      if (stamp === 1023) { clean(); }
    }
    last = tabId; time = now;
  };
  chrome.tabs.onActivated.addListener(listener);
  chrome.windows.onFocusChanged.addListener(function(windowId) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) { return; }
    chrome.tabs.query({windowId: windowId, active: true}, function(tabs) {
      tabs[0] && listener({tabId: tabs[0].id});
    });
  });
  chrome.tabs.query({currentWindow: true, active: true}, function(tabs) {
    time = Date.now();
    if (chrome.runtime.lastError) { return chrome.runtime.lastError; }
    last = tabs[0] ? tabs[0].id : (chrome.tabs.TAB_ID_NONE || -1);
  });
  _this.tabs = cache;
  _this.last = function() { return last; };
  _this.rCompare = function(a, b) {
    return cache[a.id] < cache[b.id];
  };
}, 120);
