// Background script for Gesture Detection Extension
console.log("Background script loaded");

chrome.action.onClicked.addListener(() => {
  console.log("Extension icon clicked");
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
});

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});