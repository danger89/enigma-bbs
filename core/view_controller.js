/* jslint node: true */
'use strict';

var events			= require('events');
var util			= require('util');
var assert			= require('assert');
var MCIViewFactory	= require('./mci_view_factory.js').MCIViewFactory;

exports.ViewController		= ViewController;

function ViewController(client, formId) {
	events.EventEmitter.call(this);

	var self		= this;

	this.client		= client;
	this.views		= {};	//	map of ID -> view
	this.formId		= formId || 0;

	this.onClientKeyPress = function(key, isSpecial) {
		if(isSpecial) {
			return;
		}

		if(self.focusedView && self.focusedView.acceptsInput) {
			key = 'string' === typeof key ? key : key.toString();
			self.focusedView.onKeyPress(key, isSpecial);
		}
	};

	this.onClientSpecialKeyPress = function(keyName) {
		if(self.focusedView && self.focusedView.acceptsInput) {
			self.focusedView.onSpecialKeyPress(keyName);
		}
	};

	this.onViewAction = function(action) {
		switch(action) {
			case 'next' :
				self.emit('action', { view : this, action : action });
				self.nextFocus();
				break;

			case 'accept' :	//	:TODO: consider naming this 'done'
				//	:TODO: check if id is submit, etc.
				if(self.focusedView && self.focusedView.submit) {					
					self.submitForm();
				} else {
					self.nextFocus();
				}
				break;
		}
	};

	this.submitForm = function() {
		var formData = {
			id		: self.formId,
			viewId	: self.focusedView.id,
			values	: [],
		};

		var viewData;
		for(var id in self.views) {
			try {
				viewData = self.views[id].getViewData();				
				if(typeof viewData !== 'undefined') {
					formData.values.push({
						id		: id,
						data	: viewData,
					});
				}
			} catch(e) {
				console.log(e);
			}
		}

		self.emit('submit', formData);
	};

	this.attachClientEvents();
}

util.inherits(ViewController, events.EventEmitter);

ViewController.prototype.attachClientEvents = function() {
	if(this.attached) {
		return;
	}

	this.client.on('key press', this.onClientKeyPress);
	this.client.on('special key', this.onClientSpecialKeyPress);

	this.attached = true;
};

ViewController.prototype.detachClientEvents = function() {
	if(!this.attached) {
		return;
	}

	this.client.removeListener('key press', this.onClientKeyPress);
	this.client.removeListener('special key', this.onClientSpecialKeyPress);

	this.attached = false;
};

ViewController.prototype.viewExists = function(id) {
	return id in this.views;
};

ViewController.prototype.addView = function(view) {
	assert(!this.viewExists(view.id), 'View with ID ' + view.id + ' already exists');

	this.views[view.id] = view;
};

ViewController.prototype.getView = function(id) {
	return this.views[id];
};

ViewController.prototype.switchFocus = function(id) {
	if(this.focusedView && this.focusedView.acceptsFocus) {
		this.focusedView.setFocus(false);
	}

	var view = this.getView(id);
	if(view && view.acceptsFocus) {
		this.focusedView = view;
		this.focusedView.setFocus(true);
	}

	//	:TODO: Probably log here
};

ViewController.prototype.nextFocus = function() {
	if(!this.focusedView) {
		this.switchFocus(this.views[this.firstId].id);
	} else {
		var nextId = this.views[this.focusedView.id].nextId;
		this.switchFocus(nextId);
	}
};

ViewController.prototype.setViewOrder = function(order) {
	var viewIdOrder = order || [];

	if(0 === viewIdOrder.length) {
		for(var id in this.views) {
			if(this.views[id].acceptsFocus) {
				viewIdOrder.push(id);
			}
		}

		viewIdOrder.sort(function intSort(a, b) {
			return a - b;
		});
	}

	if(viewIdOrder.length > 0) {
		var view;
		var count = viewIdOrder.length - 1;
		for(var i = 0; i < count; ++i) {
			this.views[viewIdOrder[i]].nextId = viewIdOrder[i + 1];
		}

		this.firstId = viewIdOrder[0];
		var lastId = viewIdOrder.length > 1 ? viewIdOrder[viewIdOrder.length - 1] : this.firstId;
		this.views[lastId].nextId = this.firstId;
	}
};

ViewController.prototype.loadFromMCIMap = function(mciMap) {
	var factory = new MCIViewFactory(this.client);
	var self	= this;

	Object.keys(mciMap).forEach(function onMciEntry(name) {
		var mci		= mciMap[name];
		var view	= factory.createFromMCI(mci);

		if(view) {
			view.on('action', self.onViewAction);
			self.addView(view);	//	:TODO: Needs detached
			view.redraw();	//	:TODO: This can result in double redraw() if we set focus on this item after
		}
	});
};
