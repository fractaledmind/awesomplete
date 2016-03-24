/**
 * Simple, lightweight, usable local autocomplete library for modern browsers
 * Because there weren’t enough autocomplete scripts in the world? Because I’m completely insane and have NIH syndrome? Probably both. :P
 * @author Lea Verou http://leaverou.github.io/awesomplete
 *   adapted by Stephen Margheim
 * MIT license
 */

(function (Bliss) {

var _ = function (input, o) {
	var me = this;

	// Setup
	this.input = Bliss(input);
	Bliss.attributes(this.input, {
		"autocomplete": "off",
		"aria-autocomplete": "list"
	});

	o = o || {};
	configure(this, {
		minChars: 2,
		maxItems: 10,
		autoFirst: false,
		showHint: false,
		source: null,
		data: _.DATA,
		filter: _.FILTER_STARTSWITH,
		sort: _.SORT_BYLENGTH,
		item: _.ITEM,
		replace: _.REPLACE,
		hint: _.HINT,
	}, o);

	this.index = -1;

	// Create necessary elements
	this.container = this.input.getAttribute("data-container") || o.container || null;
	this.dropdown = this.input.getAttribute("data-dropdown") || o.dropdown || null;
	this.status = Bliss(".visually-hidden", this.container) instanceof Element ?
		Bliss(".visually-hidden", this.container) :
		Bliss.create("span", {
			className: "visually-hidden",
			role: "status",
			"aria-live": "assertive",
			"aria-relevant": "additions",
			inside: this.container
		}
	);

	if (this.showHint) {
		this.hintInput = Bliss.create("input",
			{
				disabled: "disabled",
				type: "text",
				inside: Bliss.create("div",
								 { className: "awesomplete-inputs", around: this.input })
			}
		);
	}

	// Bind events

	Bliss.events(this.input, {
		"input": this.evaluate.bind(this),
		"blur": this.close.bind(this),
		"keydown": function(evt) {
			var c = evt.keyCode;

			// If the dropdown `ul` is in view, then act on keydown for the following keys:
			// Enter / Esc / Up / Down
			if(me.opened) {
				if (c === 13 && me.selected) { // Enter
					evt.preventDefault();
					me.select();
				}
				else if (c === 27) { // Esc
					me.close();
				}
				else if (c === 38 || c === 40) { // Down/Up arrow
					evt.preventDefault();
					me[c === 38? "previous" : "next"]();
				}
			}
		}
	});

	Bliss.events(this.input.form, {
		"submit": this.close.bind(this)
	});

	Bliss.events(this.dropdown, {
		"mousedown": function(evt) {
			var li = evt.target;

			if (li !== this) {

				while (li && !/li/i.test(li.nodeName)) {
					li = li.parentNode;
				}

				if (li && evt.button === 0) {  // Only select on left click
					evt.preventDefault();
					me.select(li, evt.target);
				}
			}
		}
	});

	if (this.input.hasAttribute("list")) {
		this.list = "#" + this.input.getAttribute("list");
		this.input.removeAttribute("list");
	}
	else {
		this.list = this.input.getAttribute("data-list") || o.list || [];
	}

	_.all.push(this);
};

_.prototype = {
	set list(list) {
		if (Array.isArray(list)) {
			this._list = list;
		}
		else if (typeof list === "string" && list.indexOf(",") > -1) {
				this._list = list.split(/\s*,\s*/);
		}
		else { // Element or CSS selector
			list = Bliss(list);

			if (list && list.children) {
				this._list = slice.apply(list.children).map(function (el) {
					return el.textContent.trim();
				});
			}
		}

		if (document.activeElement === this.input) {
			this.evaluate();
		}
	},

	set container(container) {
		var element = _.getElement(container);
		this._container = _.setElement(container,
												{className: _.addClassName(element, "awesomplete-container")});
		if (!(this._container)) {
			this._container = Bliss.create("div",
													Bliss.extend(
														{ className: "awesomplete-container", around: this.input },
														container));
		}
	},
	get container() {
		return this._container;
	},

	set dropdown(dropdown) {
		this._dropdown = _.setElement(dropdown, {hidden: "hidden"});
		if (!(this._dropdown)) {
			this._dropdown = Bliss.create("ul",
												 Bliss.extend(
													{hidden: "hidden", inside: this.container},
													dropdown)
			);
		}
	},
	get dropdown() {
		return this._dropdown
	},

	get selected() {
		return this.index > -1;
	},

	get opened() {
		return !this.dropdown.hasAttribute("hidden");
	},

	close: function () {
		this.dropdown.setAttribute("hidden", "");
		this.index = -1;

		Bliss.fire(this.input, "awesomplete-close");
	},

	open: function () {
		this.dropdown.removeAttribute("hidden");

		if (this.autoFirst && this.index === -1) {
			this.goto(0);
		}

		Bliss.fire(this.input, "awesomplete-open");
	},

	next: function () {
		var count = this.dropdown.children.length;

		this.goto(this.index < count - 1? this.index + 1 : -1);
	},

	previous: function () {
		var count = this.dropdown.children.length;

		this.goto(this.selected? this.index - 1 : count - 1);
	},

	// Should not be used, highlights specific item without any checks!
	goto: function (i) {
		var lis = this.dropdown.children;

		if (this.selected) {
			lis[this.index].setAttribute("aria-selected", "false");
		}

		this.index = i;

		if (i > -1 && lis.length > 0) {
			lis[i].setAttribute("aria-selected", "true");
			lis[i].scrollIntoView(false);
			if (this.showHint) this.hintInput.value = this.hint(lis[i]);
			this.status.textContent = lis[i].textContent;
		}

		Bliss.fire(this.input, "awesomplete-highlight");
	},

	select: function (selected, origin) {
		selected = selected || this.dropdown.children[this.index];

		if (selected) {
			selected.setAttribute("aria-selected", "true");
			var allowed = Bliss.fire(this.input, "awesomplete-select", {
				text: selected.textContent,
				data: this.suggestions[_.siblingIndex(selected)],
				origin: origin || selected
			});

			if (allowed) {
				this.replace(selected);
				if (this.showHint) this.hintInput.value = "";
				this.close();
				Bliss.fire(this.input, "awesomplete-selectcomplete");
			}
		}
	},

	suggest: function (suggestions) {
		var me = this;
		var value = this.input.value;
		this.suggestions = suggestions;

		// Reset
		this.index = -1;
		this.dropdown.innerHTML = "";
		if (this.showHint) this.hintInput.value = "";

		suggestions.forEach(function(text) {
			me.dropdown.appendChild(me.item(text, value));
		});

		if (this.dropdown.children.length === 0) {
			this.close();
		}
		if (!(this.opened)) {
			this.open();
		}
	},

	evaluate: function() {
		var me = this;
		var value = this.input.value;

		// Guard clause
		if (value.length < this.minChars) { this.close(); return; }

		if (this.source) {
			if (typeof(this.source) !== "function") { return; }
			var source = this.source(value);
			if (Array.isArray(source)) {
				this.suggest(source);
			}
			else if (typeof(source) === "object") {
				Bliss.fetch(source.url,
					Bliss.extend(
						{method: "GET", responseType: "json"},
						source,
						/^(?!url)/)
				).then(function(xhr) {
					if(xhr.response) {
						var suggestions = Bliss.type(xhr.response) == 'string' ?
							JSON.parse(xhr.response) :
							xhr.response;
						me.suggest(
							suggestions
								.sort(me.sort)
								.slice(0, me.maxItems)
						);
					}
				}).catch(function(error){
					console.error(error, "code: " + error.status);
					return;
				});
			}
		}
		else if (this._list.length > 0) {
			this.suggest(
				this._list
					.filter(function(item) {
						return me.filter(item, value);
					})
					.sort(this.sort)
					.slice(0, this.maxItems)
			);
		}
		else {
			this.close();
		}
	}
};

// Static methods/properties

_.all = [];

_.FILTER_CONTAINS = function (item, input) {
	return RegExp(_.regExpEscape(input.trim()), "i").test(item);
};
};

_.FILTER_ENDSWITH = function (item, input) {
	return RegExp(_.regExpEscape(input.trim()) + "$", "i").test(item);
};

_.SORT_BYLENGTH = function (a, b) {
	if (a.length !== b.length) {
		return a.length - b.length;
	}

	return a < b? -1 : 1;
};

_.ITEM = function (item, input) {
	var html =
		input === "" ?
		item :
		item.replace(
			RegExp(_.regExpEscape(input.trim()), "gi"),
			"<mark>$&</mark>");
	return Bliss.create("li", {
		innerHTML: html,
		"aria-selected": "false"
	});
};

_.REPLACE = function (item) {
	this.input.value = item.textContent;
};

_.HINT = function (item) {
	return item.textContent;
}

// Helpers

var slice = Array.prototype.slice;

function configure(instance, properties, o) {
	for (var i in properties) {
		var initial = properties[i],
				attrValue = instance.input.getAttribute("data-" + i.toLowerCase());

		if (typeof initial === "number") {
			instance[i] = parseInt(attrValue);
		}
		else if (initial === false) { // Boolean options must be false by default anyway
			instance[i] = attrValue !== null;
		}
		else if (initial instanceof Function) {
			instance[i] = null;
		}
		else {
			instance[i] = attrValue;
		}

		if (!instance[i] && instance[i] !== 0) {
			instance[i] = (i in o)? o[i] : initial;
		}
	}
}

_.getElement = function(element) {
	var _element = null;
	if (_.isSelectorOrElement(element)) {
		_element = Bliss(element);
	}
	else if (Bliss.type(element) === "object") {
		if (element["subject"] && _.isSelectorOrElement(element.subject)) {
			_element = Bliss(element.subject);
		}
	}

	return _element;
}

_.setElement = function(element, defaults) {
	var _element = null;
	if (_.isSelectorOrElement(element)) {
		_element = Bliss.set(Bliss(element),
												 defaults);
	}
	else if (Bliss.type(element) === "object") {
		if (element["subject"] && _.isSelectorOrElement(element.subject)) {
			_element = Bliss.set(Bliss(element.subject),
													 Bliss.extend(defaults, element, /^(?!subject)/));
		}
	}

	return _element;
}

_.isSelectorOrElement = function (subject) {
	var _type = Bliss.type(subject);
	return _type == "string" ||
		_.FILTER_STARTSWITH(_type, "html") && _.FILTER_ENDSWITH(_type, "element");
}

_.addClassName = function (element, className) {
	if (element) {
		return element.className.split(" ").indexOf(className) === -1 ?
			element.className.split(" ").concat([className]).join(" ") :
			element.className;
	}
	return className;
}

_.regExpEscape = function (s) {
	return s.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&");
};

_.siblingIndex = function (el) {
	/* eslint-disable no-cond-assign */
	for (var i = 0; el = el.previousElementSibling; i++);
	return i;
};

// Initialization

function init() {
	Bliss.$("input.awesomplete").forEach(function (input) {
		new _(input);
	});
}

// Are we in a browser? Check for Document constructor
if (typeof Document !== "undefined") {
	// DOM already loaded?
	if (document.readyState !== "loading") {
		init();
	}
	else {
		// Wait for it
		document.addEventListener("DOMContentLoaded", init);
	}
}

// Make sure to export Awesomplete on self when in a browser
if (typeof self !== "undefined") {
	self.Awesomplete = _;
}

// Expose Awesomplete as a CJS module
if (typeof module === "object" && module.exports) {
	module.exports = _;
}

return _;

}(Bliss));
