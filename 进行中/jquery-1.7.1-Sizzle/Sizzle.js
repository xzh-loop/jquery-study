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
		// 修正参数
		results = results || [];context = context || document;
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
		/*--- 如果存在伪类，origPOS=Expr.match.POS ---*/
		if ( parts.length > 1 && origPOS.exec( selector ) ) {
			if ( parts.length === 2 && Expr.relative[ parts[0] ] ) {	// 若parts有两元素，且首个是块间关系符
				set = posProcess( parts[0] + parts[1], context, seed );	// 可直接用posProcess查找
			} else {	// 否则，即parts元素多于2，从左到右查找，每次查找，前者作为新上下文，不断缩小范围
				set = Expr.relative[ parts[0] ] ?
					[ context ] :	// 如果第一个元素是块间关系符，直接把context作为第一个上下文元素集合
					Sizzle( parts.shift(), context );	// 弹出第一个块表达式
				while ( parts.length ) {
					selector = parts.shift();	// 弹出一个元素
					if ( Expr.relative[ selector ] ) {	// 如果是块间关系符
						selector += parts.shift();	// 将它和下个元素结合，如“>span”
					}
					set = posProcess( selector, set, seed );	// 返回值赋予set，作为下个块表达式的上下文
				}
			}
		/*--- 如果不存在伪类，从右向左找 ---*/
		} else {
			// 首块是id可以作为上下文，缩小范围，但内部有id就不这样了
			// 如不指定过滤范围，切分出的元素个数多于1，context是document，不是XML文档，
			// 第一个元素是#id，最后一个块选择器不是#id
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
		// 如果存在并列表达式，递归，合并，排序，去重
		if ( extra ) {	Sizzle( extra, origContext, results, seed );	Sizzle.uniqueSort( results );	}
		// 返回结果啦
		return results;
	};