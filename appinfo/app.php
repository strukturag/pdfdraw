<?php
declare(strict_types=1);
/**
 * @copyright Copyright (C) 2018, struktur AG
 *
 * @author Joachim Bauch <mail@joachim-bauch.de>
 *
 * @license AGPL-3.0
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

namespace OCA\Pdfdraw\AppInfo;

use OCA\Pdfdraw\Capabilities;
use OCP\Util;

Util::addScript('pdfdraw', 'loader');
Util::addStyle('pdfdraw', 'pdfdraw');

if (class_exists('\\OCP\\AppFramework\\Http\\EmptyContentSecurityPolicy')) {
	$manager = \OC::$server->getContentSecurityPolicyManager();
	$policy = new \OCP\AppFramework\Http\EmptyContentSecurityPolicy();
	$policy->addAllowedFrameDomain('blob:');

	$manager->addDefaultPolicy($policy);
}

\OC::$server->getCapabilitiesManager()->registerCapability(function() {
    return new Capabilities();
});

if (!class_exists('\\Firebase\\JWT\\BeforeValidException')) {
	require_once __DIR__ . "/../3rdparty/php-jwt/src/BeforeValidException.php";
}
if (!class_exists('\\Firebase\\JWT\\ExpiredException')) {
	require_once __DIR__ . "/../3rdparty/php-jwt/src/ExpiredException.php";
}
if (!class_exists('\\Firebase\\JWT\\SignatureInvalidException')) {
	require_once __DIR__ . "/../3rdparty/php-jwt/src/SignatureInvalidException.php";
}
if (!class_exists('\\Firebase\\JWT\\JWT')) {
		require_once __DIR__ . "/../3rdparty/php-jwt/src/JWT.php";
}
if (!class_exists('\\Firebase\\JWT\\Key')) {
	require_once __DIR__ . "/../3rdparty/php-jwt/src/Key.php";
}
