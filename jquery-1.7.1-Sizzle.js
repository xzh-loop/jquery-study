(function(){
	/* 
		A: \((?:\([^()]+\)|[^()]+)+\)	- 函数式过滤块，用于匹配伪类圆括号部分。圆括号中必须有字符，最多匹配两层括号。如:has(selector)
		B: \[(?:\[[^\[\]]*\]|['"][^'"]*['"]|[^\[\]'"]+)+\]	- 属性过滤块，用于匹配方括号包裹的内容
			b1: \[[^\[\]]*\]	嵌套方括号[[]], [[abc]], [[abc=123]], [[abc="123"]]
			b2: ['"][^'"]*['"]	有引号包裹[""], ["abc"], ["abc=123"]
			b3: [^\[\]'"]+		无引号包裹[abc], [abc=123]
			b4: 属性名和属性值的引号可有可无[abc="123"], ["abc"="123"]
		C: \\.
		D: [^ >+~,(\[\\]+
		E: [>+~]
		F: (\s*,\s*)
		G: ((?:.|\r|\n)*)
		Addup: /((?:A|B|C|D)+|E)F?G/
	*/
	var chunker = /((?:\((?:\([^()]+\)|[^()]+)+\)|\[(?:\[[^\[\]]*\]|['"][^'"]*['"]|[^\[\]'"]+)+\]|\\.|[^ >+~,(\[\\]+)+|[>+~])(\s*,\s*)?((?:.|\r|\n)*)/g,
		expando = "sizcache" + (Math.random() + '').replace('.', ''),
		done = 0,
		toString = Object.prototype.toString,
		hasDuplicate = false,
		baseHasDuplicate = true,
		rBackslash = /\\/g,
		rReturn = /\r\n/g,
		rNonWord = /\W/;
	
	// Here we check if the JavaScript engine is using some sort of
	// optimization where it does not always call our comparision
	// function. If that is the case, discard the hasDuplicate value.
	//   Thus far that includes Google Chrome.
	[0, 0].sort(function() {
		baseHasDuplicate = false;
		return 0;
	});
	
	/** 
	 * 选择器引擎入口，查找与选择器表达式 selector 匹配的元素集合
	 * 6个关键步骤：
	 * 	1、解析块表达式和块间关系符
	 * 	2、如果存在伪类，从左向右找
	 * 	3、否则从右向左查找
	 * 	4、将最终匹配元素放入结果集
	 * 	5、如果存在并列表达式，递归调用Sizzle并合并、排序、去重
	 * 	6、返回结果集
	 * @param: selector CSS选择器表达式
	 * @param: context DOM元素或文档对象，上下文
	 * @param: results 可选的数组/类数组，存放查找到的元素
	 * @param: seed 可选元素集合，从它过滤出匹配选择器表达式的元素集合
	 */
	var Sizzle = function( selector, context, results, seed ) {
		/*------------------------------------------------
		   1、解析块表达式和块间关系符，正则chunker
		  ------------------------------------------------*/
		results = results || [];context = context || document; // 修正参数
		// 备份context，用于存在并列选择器表达式的时候，
		// 如果selector是以#id开头的，可能会把context修正为#id所匹配的元素
		var origContext = context;
		// 如果context既不是DOM对象，也不是文档对象，忽略本次查询，返回[]
		if ( context.nodeType !== 1 && context.nodeType !== 9 ) {	return [];	}
		// 如果selector是空字符串或不是字符串，返回results
		if ( !selector || typeof selector !== "string" ) {	return results;	}
	
		var m,	// 存放chunker每次匹配selector的结果
			set,	// 从右向左查找中，set称为“候选集”，是最后一个块表达式匹配的元素集合
					// 从左向右查找中，set是当前块表达式匹配的元素集合，也是下一个块表达式的上下文
			checkSet,	// - 从右向左查找中，checkSet称为“映射集”，初始值是set的副本，
						// 过滤时，先根据块间关系符，把元素替换为初始元素的父元素、祖先元素或兄弟元素，
						// 没找到的设置为false，层层筛选之后，再跟set对比，剩下对应位置不为false的元素
						// - 从左到右查找中，事实上并不涉及它，
						// 只是在最后为了统一筛选和合并匹配元素的代码，将checkSet和set指向同一个数组
			extra,	// 存在并列选择器表达式时，存储逗号之后的内容，递归调用Sizzle
			ret,	// 只从右向左查找中用到，
					// 存放Sizzle.find(expr,context,isXML)对最后一个块表达式的查找结果，
					// 格式为{expr:"...",set:array}
			cur,
			pop,	// 只从右向左查找中用到，表示单个块表达式
			i,
			prune = true,	// 只从右向左查找中用到，表示set是否筛选，如selector只一块表达式，为false
			contextXML = Sizzle.isXML( context ),	// context是不是XML文档
			parts = [],		// 存放chunker从selector中提取的块表达式和块间关系符
			soFar = selector;	// 用于保存chunker每次从selector中提取块表达式或块间关系符后的剩余部分
		
		do {
			chunker.exec( "" );	// 重置chunker开始匹配的位置，等同chunker.lastIndex = 0
			m = chunker.exec( soFar );
			if ( m ) {
				soFar = m[3];	// 当前匹配之后的剩余部分赋予soFar，分组3
				parts.push( m[1] );	// 块表达式或块间关系符插入parts中，分组1
				// 若分组2非空串，即遇到“,”，表示接下来是并列选择器表达式，保存于extra中，结束循环
				if ( m[2] ) {	extra = m[3]; break;	}
			}
		} while ( m );
		/*---------------------------------------------------
		   2、如果存在位置伪类，origPOS=Expr.match.POS
		  ---------------------------------------------------*/
		if ( parts.length > 1 && origPOS.exec( selector ) ) {
			// 若parts有两元素，且首个是块间关系符，可直接用posProcess查找
			if ( parts.length === 2 && Expr.relative[ parts[0] ] ) {
				set = posProcess( parts[0] + parts[1], context, seed );
			// parts元素多于2，从左到右查找，每次查找，前者作为新上下文，不断缩小范围
			} else {
				// 如首元素是块间关系符，直接把context作为第一个上下文元素集合，否则弹出第一个块表达式
				set = Expr.relative[ parts[0] ] ? [ context ] : Sizzle( parts.shift(), context );
				while ( parts.length ) {
					selector = parts.shift();	// 弹出一个元素
					// 如果是块间关系符，将它和下个元素结合，如“>span”
					if ( Expr.relative[ selector ] ) {	selector += parts.shift();	}
					// 返回值赋予set，作为下个块表达式的上下文
					set = posProcess( selector, set, seed );
				}
			}
		/*--------------------------------------
		   3、如果不存在伪类，从右向左找
		  --------------------------------------*/
		} else {
			// 首块是#id可以作为上下文，缩小范围，但内部有#id就不能这样了
			// 如不指定过滤范围，切出的元素多于1，context是document，非XML文档，首块是#id，末块非#id
			if ( !seed && parts.length > 1 && context.nodeType === 9 && !contextXML && Expr.match.ID.test(parts[0]) && !Expr.match.ID.test(parts[parts.length - 1]) ) {
				ret = Sizzle.find( parts.shift(), context, contextXML );	// 对第一个块表达式简单查找
				context = ret.expr ?	// 如果还有剩余部分（为什么还会有剩余？）
					Sizzle.filter( ret.expr, ret.set )[0] :    // 对查找结果进行过滤
					ret.set[0];	//没有剩余部分，就匹配元素的第一个元素（也许是防止同id元素）作为后续查找的上下文
			}
			/* 如果现在context存在了，从右向左找 */
			if ( context ) {
				// 查找末块，得到候选集set（如果有seed，seed就相当于一个候选集了）
				ret = seed ? { expr: parts.pop(), set: makeArray(seed) } : Sizzle.find( parts.pop(), parts.length === 1 && (parts[0] === "~" || parts[0] === "+") && context.parentNode ? context.parentNode : context, contextXML );
				// 如果有剩余部分，对查找结果进行过滤，得到候选集
				set = ret.expr ? Sizzle.filter( ret.expr, ret.set ) : ret.set;
				// parts中还有其他元素，则创建set副本即checkSet，若parts为空，则不需再修剪了
				if ( parts.length > 0 ) {	checkSet = makeArray( set );	} else {	prune = false;	}
	
				while ( parts.length ) {
					// cur和pop是相同的
					cur = parts.pop(); pop = cur;
					// 如不是关系符，默认后代关系，如果是关系符，再弹出一个块作为checkSet的上下文
					if ( !Expr.relative[ cur ] ) {	cur = "";	} else {	pop = parts.pop();	}
					// 如没有前一个块了，表示已达数组头，直接将context作为checkSet上下文
					if ( pop == null ) {	pop = context;	}
	
					Expr.relative[ cur ]( checkSet, pop, contextXML );
				}
			} else {	checkSet = parts = [];	}	/* （首块是id但没匹配）没必要继续找了，清空 */
		}
		/*-----------------------------------------------------
		   4、根据checkSet筛选set，将最终结果放进results
		  -----------------------------------------------------*/
		// 从左到右查找是不会出现checkSet的，但为了统一筛选与合并的代码，把它设置为候选集一样（多余）
		if ( !checkSet ) {	checkSet = set;	}
		// 嗯~这是为什么？
		if ( !checkSet ) {	Sizzle.error( cur || selector );	}
		/*--- 如果checkSet是数组，遍历它，检查元素是否满足条件，如满足，将set中对应元素放入results ---*/
		if ( toString.call(checkSet) === "[object Array]" ) {
			// 不需修剪，直接将checkSet放入results
			//（当只有一个块时prune才会赋false，checkSet和set指向同一数组）
			if ( !prune ) {
				results.push.apply( results, checkSet );
			// 如context是元素，遍历映射集，如元素满足（true，是元素，包含在context中），set中对应元素入results
			} else if ( context && context.nodeType === 1 ) {
				for ( i = 0; checkSet[i] != null; i++ ) {
					if ( checkSet[i] && (checkSet[i] === true || checkSet[i].nodeType === 1 && Sizzle.contains(context, checkSet[i])) ) {	results.push( set[i] );	}
				}
			// 如context是文档对象，遍历checkSet，如元素满足（不是null，是元素），set中对应元素入results
			} else {
				for ( i = 0; checkSet[i] != null; i++ ) {
					if ( checkSet[i] && checkSet[i].nodeType === 1 ) {	results.push( set[i] );	}
				}
			}
		/*--- 如果checkSet不是数组，可能是NodeList（这种情况只在selector是个简单标签或类才出现），
			这时不需要筛选set了，checkSet和set也指向同一数组，可直接将checkSet插入results ---*/
		} else {	makeArray( checkSet, results );	}
		/*-----------------------------------------------------
		   5、如果存在并列表达式，递归，合并，排序，去重
		  -----------------------------------------------------*/
		if ( extra ) {	Sizzle( extra, origContext, results, seed );	Sizzle.uniqueSort( results );	}

		return results; // 6、返回结果集啦
	};
	
	// 工具方法，排序、去重
	//------------------------------------------
	Sizzle.uniqueSort = function( results ) {
		if ( sortOrder ) {
			hasDuplicate = baseHasDuplicate;
			results.sort( sortOrder );
	
			if ( hasDuplicate ) {
				for ( var i = 1; i < results.length; i++ ) {
					if ( results[i] === results[ i - 1 ] ) {
						results.splice( i--, 1 );
					}
				}
			}
		}
	
		return results;
	};
	
	// 公开方法，使用指定的选择器表达式 expr 对元素集合 set 进行过滤
	//--------------------------------------------------------------
	Sizzle.matches = function( expr, set ) {
		return Sizzle( expr, null, null, set );
	};
	
	// 公开方法，检查某个元素 node 是否匹配选择器表达式 expr
	//------------------------------------------------------
	Sizzle.matchesSelector = function( node, expr ) {
		return Sizzle( expr, null, null, [node] ).length > 0;
	};
	
	// 内部方法，对块表达式进行查找
	//-------------------------------------------------
	Sizzle.find = function( expr, context, isXML ) {
		var set, i, len, match, type, left;
	
		if ( !expr ) {
			return [];
		}
	
		for ( i = 0, len = Expr.order.length; i < len; i++ ) {
			type = Expr.order[i];
			
			if ( (match = Expr.leftMatch[ type ].exec( expr )) ) {
				left = match[1];
				match.splice( 1, 1 );
	
				if ( left.substr( left.length - 1 ) !== "\\" ) {
					match[1] = (match[1] || "").replace( rBackslash, "" );
					set = Expr.find[ type ]( match, context, isXML );
	
					if ( set != null ) {
						expr = expr.replace( Expr.match[ type ], "" );
						break;
					}
				}
			}
		}
	
		if ( !set ) {
			set = typeof context.getElementsByTagName !== "undefined" ?
				context.getElementsByTagName( "*" ) :
				[];
		}
	
		return { set: set, expr: expr };
	};
	
	// 内部方法，用块表达式过滤元素集合
	//------------------------------------------------------
	Sizzle.filter = function( expr, set, inplace, not ) {
		var match, anyFound,
			type, found, item, filter, left,
			i, pass,
			old = expr,
			result = [],
			curLoop = set,
			isXMLFilter = set && set[0] && Sizzle.isXML( set[0] );
	
		while ( expr && set.length ) {
			for ( type in Expr.filter ) {
				if ( (match = Expr.leftMatch[ type ].exec( expr )) != null && match[2] ) {
					filter = Expr.filter[ type ];
					left = match[1];
	
					anyFound = false;
	
					match.splice(1,1);
	
					if ( left.substr( left.length - 1 ) === "\\" ) {
						continue;
					}
	
					if ( curLoop === result ) {
						result = [];
					}
	
					if ( Expr.preFilter[ type ] ) {
						match = Expr.preFilter[ type ]( match, curLoop, inplace, result, not, isXMLFilter );
	
						if ( !match ) {
							anyFound = found = true;
	
						} else if ( match === true ) {
							continue;
						}
					}
	
					if ( match ) {
						for ( i = 0; (item = curLoop[i]) != null; i++ ) {
							if ( item ) {
								found = filter( item, match, i, curLoop );
								pass = not ^ found;
	
								if ( inplace && found != null ) {
									if ( pass ) {
										anyFound = true;
	
									} else {
										curLoop[i] = false;
									}
	
								} else if ( pass ) {
									result.push( item );
									anyFound = true;
								}
							}
						}
					}
	
					if ( found !== undefined ) {
						if ( !inplace ) {
							curLoop = result;
						}
	
						expr = expr.replace( Expr.match[ type ], "" );
	
						if ( !anyFound ) {
							return [];
						}
	
						break;
					}
				}
			}
	
			// Improper expression
			if ( expr === old ) {
				if ( anyFound == null ) {
					Sizzle.error( expr );
	
				} else {
					break;
				}
			}
	
			old = expr;
		}
	
		return curLoop;
	};
	
	// 工具方法，抛出异常
	//---------------------------------
	Sizzle.error = function( msg ) {
		throw new Error( "Syntax error, unrecognized expression: " + msg );
	};
	
	// 工具方法，获取 DOM 元素集合的文本内容，参数：nodes数组elem
	//-------------------------------------------------
	var getText = Sizzle.getText = function( elem ) {
	    var i, node,
			nodeType = elem.nodeType,
			ret = "";
	
		if ( nodeType ) {
			if ( nodeType === 1 || nodeType === 9 ) {
				// Use textContent || innerText for elements
				if ( typeof elem.textContent === 'string' ) {
					return elem.textContent;
				} else if ( typeof elem.innerText === 'string' ) {
					// Replace IE's carriage returns
					return elem.innerText.replace( rReturn, '' );
				} else {
					// Traverse it's children
					for ( elem = elem.firstChild; elem; elem = elem.nextSibling) {
						ret += getText( elem );
					}
				}
			} else if ( nodeType === 3 || nodeType === 4 ) {
				return elem.nodeValue;
			}
		} else {
	
			// If no nodeType, this is expected to be an array
			for ( i = 0; (node = elem[i]); i++ ) {
				// Do not traverse comment nodes
				if ( node.nodeType !== 8 ) {
					ret += getText( node );
				}
			}
		}
		return ret;
	};
	
	var Expr = Sizzle.selectors = {
		// 块表达式查找顺序
		order: [ "ID", "NAME", "TAG" ],

		// 正则，正则表达式集，用于匹配和解析块表达式
		match: {
			ID: /#((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
			CLASS: /\.((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
			NAME: /\[name=['"]*((?:[\w\u00c0-\uFFFF\-]|\\.)+)['"]*\]/,
			ATTR: /\[\s*((?:[\w\u00c0-\uFFFF\-]|\\.)+)\s*(?:(\S?=)\s*(?:(['"])(.*?)\3|(#?(?:[\w\u00c0-\uFFFF\-]|\\.)*)|)|)\s*\]/,
			TAG: /^((?:[\w\u00c0-\uFFFF\*\-]|\\.)+)/,
			CHILD: /:(only|nth|last|first)-child(?:\(\s*(even|odd|(?:[+\-]?\d+|(?:[+\-]?\d*)?n\s*(?:[+\-]\s*\d+)?))\s*\))?/,
			POS: /:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^\-]|$)/,
			PSEUDO: /:((?:[\w\u00c0-\uFFFF\-]|\\.)+)(?:\((['"]?)((?:\([^\)]+\)|[^\(\)]*)+)\2\))?/
		},
		leftMatch: {},

		// 属性，属性名修正函数集
		attrMap: {
			"class": "className",
			"for": "htmlFor"
		},
		// 属性，属性值读取函数集
		attrHandle: {
			href: function( elem ) {
				return elem.getAttribute( "href" );
			},
			type: function( elem ) {
				return elem.getAttribute( "type" );
			}
		},

		// 块间过滤，块间关系过滤函数集
		relative: {
			"+": function(checkSet, part){
				var isPartStr = typeof part === "string",
					isTag = isPartStr && !rNonWord.test( part ),
					isPartStrNotTag = isPartStr && !isTag;
	
				if ( isTag ) {
					part = part.toLowerCase();
				}
	
				for ( var i = 0, l = checkSet.length, elem; i < l; i++ ) {
					if ( (elem = checkSet[i]) ) {
						while ( (elem = elem.previousSibling) && elem.nodeType !== 1 ) {}
	
						checkSet[i] = isPartStrNotTag || elem && elem.nodeName.toLowerCase() === part ?
							elem || false :
							elem === part;
					}
				}
	
				if ( isPartStrNotTag ) {
					Sizzle.filter( part, checkSet, true );
				}
			},
	
			">": function( checkSet, part ) {
				var elem,
					isPartStr = typeof part === "string",
					i = 0,
					l = checkSet.length;
	
				if ( isPartStr && !rNonWord.test( part ) ) {
					part = part.toLowerCase();
	
					for ( ; i < l; i++ ) {
						elem = checkSet[i];
	
						if ( elem ) {
							var parent = elem.parentNode;
							checkSet[i] = parent.nodeName.toLowerCase() === part ? parent : false;
						}
					}
	
				} else {
					for ( ; i < l; i++ ) {
						elem = checkSet[i];
	
						if ( elem ) {
							checkSet[i] = isPartStr ?
								elem.parentNode :
								elem.parentNode === part;
						}
					}
	
					if ( isPartStr ) {
						Sizzle.filter( part, checkSet, true );
					}
				}
			},
	
			"": function(checkSet, part, isXML){
				var nodeCheck,
					doneName = done++,
					checkFn = dirCheck;
	
				if ( typeof part === "string" && !rNonWord.test( part ) ) {
					part = part.toLowerCase();
					nodeCheck = part;
					checkFn = dirNodeCheck;
				}
	
				checkFn( "parentNode", part, doneName, checkSet, nodeCheck, isXML );
			},
	
			"~": function( checkSet, part, isXML ) {
				var nodeCheck,
					doneName = done++,
					checkFn = dirCheck;
	
				if ( typeof part === "string" && !rNonWord.test( part ) ) {
					part = part.toLowerCase();
					nodeCheck = part;
					checkFn = dirNodeCheck;
				}
	
				checkFn( "previousSibling", part, doneName, checkSet, nodeCheck, isXML );
			}
		},
	
		// 查找，块表达式查找函数集
		find: {
			ID: function( match, context, isXML ) {
				if ( typeof context.getElementById !== "undefined" && !isXML ) {
					var m = context.getElementById(match[1]);
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					return m && m.parentNode ? [m] : [];
				}
			},
	
			NAME: function( match, context ) {
				if ( typeof context.getElementsByName !== "undefined" ) {
					var ret = [],
						results = context.getElementsByName( match[1] );
	
					for ( var i = 0, l = results.length; i < l; i++ ) {
						if ( results[i].getAttribute("name") === match[1] ) {
							ret.push( results[i] );
						}
					}
	
					return ret.length === 0 ? null : ret;
				}
			},
	
			TAG: function( match, context ) {
				if ( typeof context.getElementsByTagName !== "undefined" ) {
					return context.getElementsByTagName( match[1] );
				}
			}
		},
	
		// 过滤，块表达式预过滤函数集
		preFilter: {
			CLASS: function( match, curLoop, inplace, result, not, isXML ) {
				match = " " + match[1].replace( rBackslash, "" ) + " ";
	
				if ( isXML ) {
					return match;
				}
	
				for ( var i = 0, elem; (elem = curLoop[i]) != null; i++ ) {
					if ( elem ) {
						if ( not ^ (elem.className && (" " + elem.className + " ").replace(/[\t\n\r]/g, " ").indexOf(match) >= 0) ) {
							if ( !inplace ) {
								result.push( elem );
							}
	
						} else if ( inplace ) {
							curLoop[i] = false;
						}
					}
				}
	
				return false;
			},
	
			ID: function( match ) {
				return match[1].replace( rBackslash, "" );
			},
	
			TAG: function( match, curLoop ) {
				return match[1].replace( rBackslash, "" ).toLowerCase();
			},
	
			CHILD: function( match ) {
				if ( match[1] === "nth" ) {
					if ( !match[2] ) {
						Sizzle.error( match[0] );
					}
	
					match[2] = match[2].replace(/^\+|\s*/g, '');
	
					// parse equations like 'even', 'odd', '5', '2n', '3n+2', '4n-1', '-n+6'
					var test = /(-?)(\d*)(?:n([+\-]?\d*))?/.exec(
						match[2] === "even" && "2n" || match[2] === "odd" && "2n+1" ||
						!/\D/.test( match[2] ) && "0n+" + match[2] || match[2]);
	
					// calculate the numbers (first)n+(last) including if they are negative
					match[2] = (test[1] + (test[2] || 1)) - 0;
					match[3] = test[3] - 0;
				}
				else if ( match[2] ) {
					Sizzle.error( match[0] );
				}
	
				// TODO: Move to normal caching system
				match[0] = done++;
	
				return match;
			},
	
			ATTR: function( match, curLoop, inplace, result, not, isXML ) {
				var name = match[1] = match[1].replace( rBackslash, "" );
				
				if ( !isXML && Expr.attrMap[name] ) {
					match[1] = Expr.attrMap[name];
				}
	
				// Handle if an un-quoted value was used
				match[4] = ( match[4] || match[5] || "" ).replace( rBackslash, "" );
	
				if ( match[2] === "~=" ) {
					match[4] = " " + match[4] + " ";
				}
	
				return match;
			},
	
			PSEUDO: function( match, curLoop, inplace, result, not ) {
				if ( match[1] === "not" ) {
					// If we're dealing with a complex expression, or a simple one
					if ( ( chunker.exec(match[3]) || "" ).length > 1 || /^\w/.test(match[3]) ) {
						match[3] = Sizzle(match[3], null, null, curLoop);
	
					} else {
						var ret = Sizzle.filter(match[3], curLoop, inplace, true ^ not);
	
						if ( !inplace ) {
							result.push.apply( result, ret );
						}
	
						return false;
					}
	
				} else if ( Expr.match.POS.test( match[0] ) || Expr.match.CHILD.test( match[0] ) ) {
					return true;
				}
				
				return match;
			},
	
			POS: function( match ) {
				match.unshift( true );
	
				return match;
			}
		},

		// 伪类，伪类过滤函数集
		filters: {
			enabled: function( elem ) {
				return elem.disabled === false && elem.type !== "hidden";
			},
	
			disabled: function( elem ) {
				return elem.disabled === true;
			},
	
			checked: function( elem ) {
				return elem.checked === true;
			},
			
			selected: function( elem ) {
				// Accessing this property makes selected-by-default
				// options in Safari work properly
				if ( elem.parentNode ) {
					elem.parentNode.selectedIndex;
				}
				
				return elem.selected === true;
			},
	
			parent: function( elem ) {
				return !!elem.firstChild;
			},
	
			empty: function( elem ) {
				return !elem.firstChild;
			},
	
			has: function( elem, i, match ) {
				return !!Sizzle( match[3], elem ).length;
			},
	
			header: function( elem ) {
				return (/h\d/i).test( elem.nodeName );
			},
	
			text: function( elem ) {
				var attr = elem.getAttribute( "type" ), type = elem.type;
				// IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc) 
				// use getAttribute instead to test this case
				return elem.nodeName.toLowerCase() === "input" && "text" === type && ( attr === type || attr === null );
			},
	
			radio: function( elem ) {
				return elem.nodeName.toLowerCase() === "input" && "radio" === elem.type;
			},
	
			checkbox: function( elem ) {
				return elem.nodeName.toLowerCase() === "input" && "checkbox" === elem.type;
			},
	
			file: function( elem ) {
				return elem.nodeName.toLowerCase() === "input" && "file" === elem.type;
			},
	
			password: function( elem ) {
				return elem.nodeName.toLowerCase() === "input" && "password" === elem.type;
			},
	
			submit: function( elem ) {
				var name = elem.nodeName.toLowerCase();
				return (name === "input" || name === "button") && "submit" === elem.type;
			},
	
			image: function( elem ) {
				return elem.nodeName.toLowerCase() === "input" && "image" === elem.type;
			},
	
			reset: function( elem ) {
				var name = elem.nodeName.toLowerCase();
				return (name === "input" || name === "button") && "reset" === elem.type;
			},
	
			button: function( elem ) {
				var name = elem.nodeName.toLowerCase();
				return name === "input" && "button" === elem.type || name === "button";
			},
	
			input: function( elem ) {
				return (/input|select|textarea|button/i).test( elem.nodeName );
			},
	
			focus: function( elem ) {
				return elem === elem.ownerDocument.activeElement;
			}
		},
	
		// 伪类，位置伪类过滤函数集
		setFilters: {
			first: function( elem, i ) {
				return i === 0;
			},
	
			last: function( elem, i, match, array ) {
				return i === array.length - 1;
			},
	
			even: function( elem, i ) {
				return i % 2 === 0;
			},
	
			odd: function( elem, i ) {
				return i % 2 === 1;
			},
	
			lt: function( elem, i, match ) {
				return i < match[3] - 0;
			},
	
			gt: function( elem, i, match ) {
				return i > match[3] - 0;
			},
	
			nth: function( elem, i, match ) {
				return match[3] - 0 === i;
			},
	
			eq: function( elem, i, match ) {
				return match[3] - 0 === i;
			}
		},
	
		// 过滤，块表达式过滤函数集
		filter: {
			PSEUDO: function( elem, match, i, array ) {
				var name = match[1],
					filter = Expr.filters[ name ];
	
				if ( filter ) {
					return filter( elem, i, match, array );
	
				} else if ( name === "contains" ) {
					return (elem.textContent || elem.innerText || getText([ elem ]) || "").indexOf(match[3]) >= 0;
	
				} else if ( name === "not" ) {
					var not = match[3];
	
					for ( var j = 0, l = not.length; j < l; j++ ) {
						if ( not[j] === elem ) {
							return false;
						}
					}
	
					return true;
	
				} else {
					Sizzle.error( name );
				}
			},
	
			CHILD: function( elem, match ) {
				var first, last,
					doneName, parent, cache,
					count, diff,
					type = match[1],
					node = elem;
	
				switch ( type ) {
					case "only":
					case "first":
						while ( (node = node.previousSibling) )	 {
							if ( node.nodeType === 1 ) { 
								return false; 
							}
						}
	
						if ( type === "first" ) { 
							return true; 
						}
	
						node = elem;
	
					case "last":
						while ( (node = node.nextSibling) )	 {
							if ( node.nodeType === 1 ) { 
								return false; 
							}
						}
	
						return true;
	
					case "nth":
						first = match[2];
						last = match[3];
	
						if ( first === 1 && last === 0 ) {
							return true;
						}
						
						doneName = match[0];
						parent = elem.parentNode;
		
						if ( parent && (parent[ expando ] !== doneName || !elem.nodeIndex) ) {
							count = 0;
							
							for ( node = parent.firstChild; node; node = node.nextSibling ) {
								if ( node.nodeType === 1 ) {
									node.nodeIndex = ++count;
								}
							} 
	
							parent[ expando ] = doneName;
						}
						
						diff = elem.nodeIndex - last;
	
						if ( first === 0 ) {
							return diff === 0;
	
						} else {
							return ( diff % first === 0 && diff / first >= 0 );
						}
				}
			},
	
			ID: function( elem, match ) {
				return elem.nodeType === 1 && elem.getAttribute("id") === match;
			},
	
			TAG: function( elem, match ) {
				return (match === "*" && elem.nodeType === 1) || !!elem.nodeName && elem.nodeName.toLowerCase() === match;
			},
			
			CLASS: function( elem, match ) {
				return (" " + (elem.className || elem.getAttribute("class")) + " ")
					.indexOf( match ) > -1;
			},
	
			ATTR: function( elem, match ) {
				var name = match[1],
					result = Sizzle.attr ?
						Sizzle.attr( elem, name ) :
						Expr.attrHandle[ name ] ?
						Expr.attrHandle[ name ]( elem ) :
						elem[ name ] != null ?
							elem[ name ] :
							elem.getAttribute( name ),
					value = result + "",
					type = match[2],
					check = match[4];
	
				return result == null ?
					type === "!=" :
					!type && Sizzle.attr ?
					result != null :
					type === "=" ?
					value === check :
					type === "*=" ?
					value.indexOf(check) >= 0 :
					type === "~=" ?
					(" " + value + " ").indexOf(check) >= 0 :
					!check ?
					value && result !== false :
					type === "!=" ?
					value !== check :
					type === "^=" ?
					value.indexOf(check) === 0 :
					type === "$=" ?
					value.substr(value.length - check.length) === check :
					type === "|=" ?
					value === check || value.substr(0, check.length + 1) === check + "-" :
					false;
			},
	
			POS: function( elem, match, i, array ) {
				var name = match[2],
					filter = Expr.setFilters[ name ];
	
				if ( filter ) {
					return filter( elem, i, match, array );
				}
			}
		}
	};
	
	var origPOS = Expr.match.POS,
		fescape = function(all, num){
			return "\\" + (num - 0 + 1);
		};
	
	for ( var type in Expr.match ) {
		Expr.match[ type ] = new RegExp( Expr.match[ type ].source + (/(?![^\[]*\])(?![^\(]*\))/.source) );
		Expr.leftMatch[ type ] = new RegExp( /(^(?:.|\r|\n)*?)/.source + Expr.match[ type ].source.replace(/\\(\d+)/g, fescape) );
	}
	
	var makeArray = function( array, results ) {
		array = Array.prototype.slice.call( array, 0 );
	
		if ( results ) {
			results.push.apply( results, array );
			return results;
		}
		
		return array;
	};
	
	// Perform a simple check to determine if the browser is capable of
	// converting a NodeList to an array using builtin methods.
	// Also verifies that the returned array holds DOM nodes
	// (which is not the case in the Blackberry browser)
	try {
		Array.prototype.slice.call( document.documentElement.childNodes, 0 )[0].nodeType;
	
	// Provide a fallback method if it does not work
	} catch( e ) {
		makeArray = function( array, results ) {
			var i = 0,
				ret = results || [];
	
			if ( toString.call(array) === "[object Array]" ) {
				Array.prototype.push.apply( ret, array );
	
			} else {
				if ( typeof array.length === "number" ) {
					for ( var l = array.length; i < l; i++ ) {
						ret.push( array[i] );
					}
	
				} else {
					for ( ; array[i]; i++ ) {
						ret.push( array[i] );
					}
				}
			}
	
			return ret;
		};
	}
	
	var sortOrder, siblingCheck;
	
	if ( document.documentElement.compareDocumentPosition ) {
		sortOrder = function( a, b ) {
			if ( a === b ) {
				hasDuplicate = true;
				return 0;
			}
	
			if ( !a.compareDocumentPosition || !b.compareDocumentPosition ) {
				return a.compareDocumentPosition ? -1 : 1;
			}
	
			return a.compareDocumentPosition(b) & 4 ? -1 : 1;
		};
	
	} else {
		sortOrder = function( a, b ) {
			// The nodes are identical, we can exit early
			if ( a === b ) {
				hasDuplicate = true;
				return 0;
	
			// Fallback to using sourceIndex (in IE) if it's available on both nodes
			} else if ( a.sourceIndex && b.sourceIndex ) {
				return a.sourceIndex - b.sourceIndex;
			}
	
			var al, bl,
				ap = [],
				bp = [],
				aup = a.parentNode,
				bup = b.parentNode,
				cur = aup;
	
			// If the nodes are siblings (or identical) we can do a quick check
			if ( aup === bup ) {
				return siblingCheck( a, b );
	
			// If no parents were found then the nodes are disconnected
			} else if ( !aup ) {
				return -1;
	
			} else if ( !bup ) {
				return 1;
			}
	
			// Otherwise they're somewhere else in the tree so we need
			// to build up a full list of the parentNodes for comparison
			while ( cur ) {
				ap.unshift( cur );
				cur = cur.parentNode;
			}
	
			cur = bup;
	
			while ( cur ) {
				bp.unshift( cur );
				cur = cur.parentNode;
			}
	
			al = ap.length;
			bl = bp.length;
	
			// Start walking down the tree looking for a discrepancy
			for ( var i = 0; i < al && i < bl; i++ ) {
				if ( ap[i] !== bp[i] ) {
					return siblingCheck( ap[i], bp[i] );
				}
			}
	
			// We ended someplace up the tree so do a sibling check
			return i === al ?
				siblingCheck( a, bp[i], -1 ) :
				siblingCheck( ap[i], b, 1 );
		};
	
		siblingCheck = function( a, b, ret ) {
			if ( a === b ) {
				return ret;
			}
	
			var cur = a.nextSibling;
	
			while ( cur ) {
				if ( cur === b ) {
					return -1;
				}
	
				cur = cur.nextSibling;
			}
	
			return 1;
		};
	}
	
	// Check to see if the browser returns elements by name when
	// querying by getElementById (and provide a workaround)
	(function(){
		// We're going to inject a fake input element with a specified name
		var form = document.createElement("div"),
			id = "script" + (new Date()).getTime(),
			root = document.documentElement;
	
		form.innerHTML = "<a name='" + id + "'/>";
	
		// Inject it into the root element, check its status, and remove it quickly
		root.insertBefore( form, root.firstChild );
	
		// The workaround has to do additional checks after a getElementById
		// Which slows things down for other browsers (hence the branching)
		if ( document.getElementById( id ) ) {
			Expr.find.ID = function( match, context, isXML ) {
				if ( typeof context.getElementById !== "undefined" && !isXML ) {
					var m = context.getElementById(match[1]);
	
					return m ?
						m.id === match[1] || typeof m.getAttributeNode !== "undefined" && m.getAttributeNode("id").nodeValue === match[1] ?
							[m] :
							undefined :
						[];
				}
			};
	
			Expr.filter.ID = function( elem, match ) {
				var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
	
				return elem.nodeType === 1 && node && node.nodeValue === match;
			};
		}
	
		root.removeChild( form );
	
		// release memory in IE
		root = form = null;
	})();
	
	(function(){
		// Check to see if the browser returns only elements
		// when doing getElementsByTagName("*")
	
		// Create a fake element
		var div = document.createElement("div");
		div.appendChild( document.createComment("") );
	
		// Make sure no comments are found
		if ( div.getElementsByTagName("*").length > 0 ) {
			Expr.find.TAG = function( match, context ) {
				var results = context.getElementsByTagName( match[1] );
	
				// Filter out possible comments
				if ( match[1] === "*" ) {
					var tmp = [];
	
					for ( var i = 0; results[i]; i++ ) {
						if ( results[i].nodeType === 1 ) {
							tmp.push( results[i] );
						}
					}
	
					results = tmp;
				}
	
				return results;
			};
		}
	
		// Check to see if an attribute returns normalized href attributes
		div.innerHTML = "<a href='#'></a>";
	
		if ( div.firstChild && typeof div.firstChild.getAttribute !== "undefined" &&
				div.firstChild.getAttribute("href") !== "#" ) {
	
			Expr.attrHandle.href = function( elem ) {
				return elem.getAttribute( "href", 2 );
			};
		}
	
		// release memory in IE
		div = null;
	})();
	
	// 如果支持方法 querySelectorAll()，则调用该方法查找元素
	if ( document.querySelectorAll ) {
		(function(){
			var oldSizzle = Sizzle,
				div = document.createElement("div"),
				id = "__sizzle__";
	
			div.innerHTML = "<p class='TEST'></p>";
	
			// Safari can't handle uppercase or unicode characters when
			// in quirks mode.
			if ( div.querySelectorAll && div.querySelectorAll(".TEST").length === 0 ) {
				return;
			}
		
			Sizzle = function( query, context, extra, seed ) {
				context = context || document;
	
				// Only use querySelectorAll on non-XML documents
				// (ID selectors don't work in non-HTML documents)
				if ( !seed && !Sizzle.isXML(context) ) {
					// See if we find a selector to speed up
					var match = /^(\w+$)|^\.([\w\-]+$)|^#([\w\-]+$)/.exec( query );
					
					if ( match && (context.nodeType === 1 || context.nodeType === 9) ) {
						// Speed-up: Sizzle("TAG")
						if ( match[1] ) {
							return makeArray( context.getElementsByTagName( query ), extra );
						
						// Speed-up: Sizzle(".CLASS")
						} else if ( match[2] && Expr.find.CLASS && context.getElementsByClassName ) {
							return makeArray( context.getElementsByClassName( match[2] ), extra );
						}
					}
					
					if ( context.nodeType === 9 ) {
						// Speed-up: Sizzle("body")
						// The body element only exists once, optimize finding it
						if ( query === "body" && context.body ) {
							return makeArray( [ context.body ], extra );
							
						// Speed-up: Sizzle("#ID")
						} else if ( match && match[3] ) {
							var elem = context.getElementById( match[3] );
	
							// Check parentNode to catch when Blackberry 4.6 returns
							// nodes that are no longer in the document #6963
							if ( elem && elem.parentNode ) {
								// Handle the case where IE and Opera return items
								// by name instead of ID
								if ( elem.id === match[3] ) {
									return makeArray( [ elem ], extra );
								}
								
							} else {
								return makeArray( [], extra );
							}
						}
						
						try {
							// 尝试调用 querySelectorAll() 查找，如上下文是 document，则直接调用querySelectorAll() 查找
							return makeArray( context.querySelectorAll(query), extra );
						} catch(qsaError) {}
	
					// qSA works strangely on Element-rooted queries
					// We can work around this by specifying an extra ID on the root
					// and working up from there (Thanks to Andrew Dupont for the technique)
					// IE 8 doesn't work on object elements
					} else if ( context.nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
						var oldContext = context,
							old = context.getAttribute( "id" ),
							nid = old || id,
							hasParent = context.parentNode,
							relativeHierarchySelector = /^\s*[+~]/.test( query );
	
						if ( !old ) {
							context.setAttribute( "id", nid );
						} else {
							nid = nid.replace( /'/g, "\\$&" );
						}
						if ( relativeHierarchySelector && hasParent ) {
							context = context.parentNode;
						}
	
						try {
							if ( !relativeHierarchySelector || hasParent ) {
								// 如果上下文不是document，则为选择器表达式增加上下文，然后调用 querySelector 查找
								return makeArray( context.querySelectorAll( "[id='" + nid + "'] " + query ), extra );
							}
	
						} catch(pseudoError) {
						} finally {
							if ( !old ) {
								oldContext.removeAttribute( "id" );
							}
						}
					}
				}
				
				// 如果查找失败，则仍然调用 oldSizzle()
				return oldSizzle(query, context, extra, seed);
			};
	
			for ( var prop in oldSizzle ) {
				Sizzle[ prop ] = oldSizzle[ prop ];
			}
	
			// release memory in IE
			div = null;
		})();
	}
	
	// 如果支持方法 matchesSelector()，则调用该方法检查元素是否匹配选择器表达式
	(function(){
		var html = document.documentElement,
			matches = html.matchesSelector || html.mozMatchesSelector || html.webkitMatchesSelector || html.msMatchesSelector;
		// 如果支持方法 matchesSelector()
		if ( matches ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9 fails this)
			var disconnectedMatch = !matches.call( document.createElement( "div" ), "div" ),
				pseudoWorks = false;
	
			try {
				// This should fail with an exception
				// Gecko does not error, returns false instead
				matches.call( document.documentElement, "[test!='']:sizzle" );
		
			} catch( pseudoError ) {
				pseudoWorks = true;
			}
	
			Sizzle.matchesSelector = function( node, expr ) {
				// Make sure that attribute selectors are quoted
				expr = expr.replace(/\=\s*([^'"\]]*)\s*\]/g, "='$1']");
	
				if ( !Sizzle.isXML( node ) ) {
					try { 
						if ( pseudoWorks || !Expr.match.PSEUDO.test( expr ) && !/!=/.test( expr ) ) {
							// 尝试调用方法 matchesSelector()
							var ret = matches.call( node, expr );
	
							// IE 9's matchesSelector returns false on disconnected nodes
							if ( ret || !disconnectedMatch ||
									// As well, disconnected nodes are said to be in a document
									// fragment in IE 9, so check for that
									node.document && node.document.nodeType !== 11 ) {
								return ret;
							}
						}
					} catch(e) {}
				}
	
				// 如果查找失败，则仍然调用 Sizzle()
				return Sizzle(expr, null, null, [node]).length > 0;
			};
		}
	})();
	
	// 检测浏览器是否支持 getElementsByClassName()
	(function(){
		var div = document.createElement("div");
	
		div.innerHTML = "<div class='test e'></div><div class='test'></div>";
	
		// Opera can't find a second classname (in 9.6)
		// Also, make sure that getElementsByClassName actually exists
		if ( !div.getElementsByClassName || div.getElementsByClassName("e").length === 0 ) {
			return;
		}
	
		// Safari caches class attributes, doesn't catch changes (in 3.2)
		div.lastChild.className = "e";
	
		if ( div.getElementsByClassName("e").length === 1 ) {
			return;
		}
		
		Expr.order.splice(1, 0, "CLASS");
		Expr.find.CLASS = function( match, context, isXML ) {
			if ( typeof context.getElementsByClassName !== "undefined" && !isXML ) {
				return context.getElementsByClassName(match[1]);
			}
		};
	
		// release memory in IE
		div = null;
	})();
	
	function dirNodeCheck( dir, cur, doneName, checkSet, nodeCheck, isXML ) {
		for ( var i = 0, l = checkSet.length; i < l; i++ ) {
			var elem = checkSet[i];
	
			if ( elem ) {
				var match = false;
	
				elem = elem[dir];
	
				while ( elem ) {
					if ( elem[ expando ] === doneName ) {
						match = checkSet[elem.sizset];
						break;
					}
	
					if ( elem.nodeType === 1 && !isXML ){
						elem[ expando ] = doneName;
						elem.sizset = i;
					}
	
					if ( elem.nodeName.toLowerCase() === cur ) {
						match = elem;
						break;
					}
	
					elem = elem[dir];
				}
	
				checkSet[i] = match;
			}
		}
	}
	
	function dirCheck( dir, cur, doneName, checkSet, nodeCheck, isXML ) {
		for ( var i = 0, l = checkSet.length; i < l; i++ ) {
			var elem = checkSet[i];
	
			if ( elem ) {
				var match = false;
				
				elem = elem[dir];
	
				while ( elem ) {
					if ( elem[ expando ] === doneName ) {
						match = checkSet[elem.sizset];
						break;
					}
	
					if ( elem.nodeType === 1 ) {
						if ( !isXML ) {
							elem[ expando ] = doneName;
							elem.sizset = i;
						}
	
						if ( typeof cur !== "string" ) {
							if ( elem === cur ) {
								match = true;
								break;
							}
	
						} else if ( Sizzle.filter( cur, [elem] ).length > 0 ) {
							match = elem;
							break;
						}
					}
	
					elem = elem[dir];
				}
	
				checkSet[i] = match;
			}
		}
	}
	
	if ( document.documentElement.contains ) {
		// 工具方法，检测元素 a 是否包含元素 b
		//-------------------------------------
		Sizzle.contains = function( a, b ) {
			return a !== b && (a.contains ? a.contains(b) : true);
		};
	
	} else if ( document.documentElement.compareDocumentPosition ) {
		// 工具方法，检测元素 a 是否包含元素 b
		//-------------------------------------
		Sizzle.contains = function( a, b ) {
			return !!(a.compareDocumentPosition(b) & 16);
		};
	
	} else {
		Sizzle.contains = function() {
			return false;
		};
	}
	
	Sizzle.isXML = function( elem ) {
		// documentElement is verified for cases where it doesn't yet exist
		// (such as loading iframes in IE - #4833) 
		var documentElement = (elem ? elem.ownerDocument || elem : 0).documentElement;
	
		return documentElement ? documentElement.nodeName !== "HTML" : false;
	};
	
	var posProcess = function( selector, context, seed ) {
		var match,
			tmpSet = [],
			later = "",
			root = context.nodeType ? [context] : context;
		while ( (match = Expr.match.PSEUDO.exec( selector )) ) {
			later += match[0];	// 存储一个匹配的伪类（循环存储所有）
			selector = selector.replace( Expr.match.PSEUDO, "" );	// 删除一个伪类（循环删除所有）
		}
		// 如果删除伪类后selector只剩一块间关系符，则追加通配符“*”，如“>*”
		selector = Expr.relative[selector] ? selector + "*" : selector;
		// 对已删除伪类的选择器表达式进行查找，结果放进tmpSet
		for ( var i = 0, l = root.length; i < l; i++ ) {
			Sizzle( selector, root[i], tmpSet, seed );
		}
	
		return Sizzle.filter( later, tmpSet );	// 用later过滤tmpSet
	};
	
	// EXPOSE
	// Override sizzle attribute retrieval
	Sizzle.attr = jQuery.attr;
	Sizzle.selectors.attrMap = {};
	jQuery.find = Sizzle;
	jQuery.expr = Sizzle.selectors;
	jQuery.expr[":"] = jQuery.expr.filters;
	jQuery.unique = Sizzle.uniqueSort;
	jQuery.text = Sizzle.getText;
	jQuery.isXMLDoc = Sizzle.isXML;
	jQuery.contains = Sizzle.contains;
	
	
})();