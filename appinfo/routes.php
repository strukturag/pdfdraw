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

return [
	'routes' => [
		[
			'name' => 'viewer#index',
			'url' => '/{fileId}',
			'verb' => 'GET',
		],
		[
			'name' => 'viewer#publicIndex',
			'url' => '/s/{token}',
			'verb' => 'GET',
		],
		[
			'name' => 'viewer#viewer',
			'url' => '/viewer/{fileId}',
			'verb' => 'GET',
		],
		[
			'name' => 'viewer#downloadFile',
			'url' => '/d/{token}',
			'verb' => 'GET',
		],
		[
			'name' => 'api#downloadFile',
			'url' => '/download/{fileId}',
			'verb' => 'GET',
		],
	],
	'ocs' => [
		[
			'name' => 'Api#getItems',
			'url' => '/api/{apiVersion}/item/{fileId}',
			'verb' => 'GET',
			'requirements' => [
				'apiVersion' => 'v1',
			],
		],
		[
			'name' => 'Api#storeItem',
			'url' => '/api/{apiVersion}/item/{fileId}/{page}/{name}',
			'verb' => 'POST',
			'requirements' => [
				'apiVersion' => 'v1',
			],
		],
		[
			'name' => 'Api#deleteItem',
			'url' => '/api/{apiVersion}/item/{fileId}/{page}/{name}',
			'verb' => 'DELETE',
			'requirements' => [
				'apiVersion' => 'v1',
			],
		],
	]
];
