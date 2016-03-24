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

	Bliss.extend(this, Bliss.extend({
		minChars: 2,
		maxItems: 10,
		autoFirst: false,
		source: null,
		container: {},
		ul: {},
		filter: _.FILTER_CONTAINS,
		sort: _.SORT_BYLENGTH,
		item: _.ITEM,
		replace: _.REPLACE,
		hint: _.HINT,
		showHint: false
	}, Bliss.extend(o, _.data(this.input))));

	this.index = -1;
	this.showHint = this.showHint || this.input.classList.contains('show-hint');

	// Create necessary elements
	this.container = this.container['subject'] && this.container.subject instanceof Element ?
		Bliss.set(this.container.subject,
							Bliss.extend(
								{ className:
									this.container.subject.className.split(' ').indexOf("awesomplete") === -1 ?
									this.container.subject.className.split(' ').concat(["awesomplete"]).join(' ') :
									this.container.subject.className
								},
								this.container,
								/^(?!subject)/)) :
		Bliss.create("div",
								 Bliss.extend(
									{ className: "awesomplete", around: this.input },
									this.container)
	);

	this.ul = this.ul['subject'] && this.ul.subject instanceof Element ?
		Bliss.set(this.ul.subject,
							Bliss.extend(
								{hidden: "hidden"},
								this.ul,
								/^(?!subject)/)) :
		Bliss.create("ul",
								 Bliss.extend(
									{hidden: "hidden", inside: this.container},
									this.ul)
	);

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
		this.hint_input = Bliss.create("input",
			{
				disabled: "disabled",
				type: "text",
				className: "form-control",
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

	Bliss.events(this.ul, {
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

	get selected() {
		return this.index > -1;
	},

	get opened() {
		return !this.ul.hasAttribute("hidden");
	},

	close: function () {
		this.ul.setAttribute("hidden", "");
		this.index = -1;

		Bliss.fire(this.input, "awesomplete-close");
	},

	open: function () {
		this.ul.removeAttribute("hidden");

		if (this.autoFirst && this.index === -1) {
			this.goto(0);
		}

		Bliss.fire(this.input, "awesomplete-open");
	},

	next: function () {
		var count = this.ul.children.length;

		this.goto(this.index < count - 1? this.index + 1 : -1);
	},

	previous: function () {
		var count = this.ul.children.length;

		this.goto(this.selected? this.index - 1 : count - 1);
	},

	// Should not be used, highlights specific item without any checks!
	goto: function (i) {
		var lis = this.ul.children;

		if (this.selected) {
			lis[this.index].setAttribute("aria-selected", "false");
		}

		this.index = i;

		if (i > -1 && lis.length > 0) {
			lis[i].setAttribute("aria-selected", "true");
			lis[i].scrollIntoView(false);
			if (this.showHint) {
				this.hint_input.value = this.hint(lis[i]);
			}
			this.status.textContent = lis[i].textContent;
		}

		Bliss.fire(this.input, "awesomplete-highlight");
	},

	select: function (selected, origin) {
		selected = selected || this.ul.children[this.index];

		if (selected) {
			selected.setAttribute("aria-selected", "true");
			var allowed = Bliss.fire(this.input, "awesomplete-select", {
				text: selected.textContent,
				data: this.suggestions[_.siblingIndex(selected)],
				origin: origin || selected
			});

			if (allowed) {
				this.replace(selected);
				this.hint_input.value = '';
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
		this.ul.innerHTML = "";

		suggestions.forEach(function(text) {
			me.ul.appendChild(me.item(text, value));
		});

		if (this.ul.children.length === 0) {
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

_.FILTER_CONTAINS = function (text, input) {
	return RegExp(_.regExpEscape(input.trim()), "i").test(text);
};

_.FILTER_STARTSWITH = function (text, input) {
	return RegExp("^" + _.regExpEscape(input.trim()), "i").test(text);
};

_.SORT_BYLENGTH = function (a, b) {
	if (a.length !== b.length) {
		return a.length - b.length;
	}

	return a < b? -1 : 1;
};

_.ITEM = function (text, input) {
	var html = input === '' ? text : text.replace(RegExp(_.regExpEscape(input.trim()), "gi"), "<mark>$&</mark>");
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

_.data = function (element) {
	var data = {};
	[].forEach.call(element.attributes, function(attr) {
		if (/^data-/.test(attr.name)) {
			var camelCaseName = attr.name.substr(5).replace(/-(.)/g, function ($0, $1) {
				return $1.toUpperCase();
			});
			data[camelCaseName] = attr.value;
		}
	});
	return data;
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
