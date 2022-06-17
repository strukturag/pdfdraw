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

namespace OCA\Pdfdraw\Controller;

use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use \Firebase\JWT\JWT;
use \Firebase\JWT\Key;
use OC\Files\Filesystem;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataDownloadResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\Files\Config\IUserMountCache;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\ILogger;
use OCP\IRequest;

class ApiController extends OCSController {

	/** @var IDBConnection */
	private $db;

	/**
	 * Root folder
	 *
	 * @var IRootFolder
	 */
	private $root;

	/** @var IUserMountCache */
	private $userMountCache;

	/** @var IConfig */
	private $config;

	/** @var ILogger */
	private $logger;

	/**
	 * @param string $AppName
	 * @param IRequest $request
	 */
	public function __construct(
			string $AppName,
			IRequest $request,
			IDBConnection $db,
			IRootFolder $root,
			IUserMountCache $userMountCache,
			IConfig	$config,
			ILogger $logger) {
		parent::__construct($AppName, $request);
		$this->db = $db;
		$this->root = $root;
		$this->userMountCache = $userMountCache;
		$this->config = $config;
		$this->logger = $logger;
	}

	/**
	 * Decode the JWT token from the request.
	 *
	 * @param string $fileId
	 * @return array|null
	 */
	private function decodeToken(string $fileId) {
		$authHeader = $this->request->getHeader('Authorization');
		if (empty($authHeader) || strpos($authHeader, 'Bearer') !== 0) {
			return null;
		}
		$token = substr($authHeader, 7);
		$backend = $this->config->getAppValue('pdfdraw', 'backend');
		$secret = null;
		if (!empty($backend)) {
			$backend = json_decode($backend);
			$secret = $backend->secret;
		}

		try {
			$key = new Key($secret, 'HS256');
			$decoded = JWT::decode($token, $key);
		} catch (\Exception $e) {
			return null;
		}

		if ($decoded->file !== $fileId) {
			return null;
		}
		return $decoded;
	}

	/**
	 * Return list of items on a given file.
	 *
	 * @PublicPage
	 * @NoCSRFRequired
	 *
	 * @param string $fileId
	 * @return DataResponse
	 */
	public function getItems(string $fileId) {
		$decoded = $this->decodeToken($fileId);
		if (empty($decoded)) {
			return new DataResponse([], Http::STATUS_UNAUTHORIZED);
		}

		if ($decoded->iss !== 'backend') {
			return new DataResponse([], Http::STATUS_UNAUTHORIZED);
		}

		$query = $this->db->getQueryBuilder();
		$query->select('*')
			->from('pdfdraw_items')
			->where($query->expr()->eq('file_id', $query->createNamedParameter($fileId)));
		$result = $query->execute();
		$items = [];
		while ($row = $result->fetch()) {
			$items[] = [
				'page' => (int) $row['page'],
				'name' => $row['name'],
				'data' => $row['data'],
			];
		}
		$result->closeCursor();
		return new DataResponse($items);
	}

	/**
	 * Create / update item on a page of a given file.
	 *
	 * @PublicPage
	 * @NoCSRFRequired
	 *
	 * @param string $fileId
	 * @param int $page
	 * @param string $name
	 * @param string $data
	 * @return DataResponse
	 */
	public function storeItem(string $fileId, int $page, string $name, string $data) {
		$decoded = $this->decodeToken($fileId);
		if (empty($decoded)) {
			return new DataResponse([], Http::STATUS_UNAUTHORIZED);
		}

		if ($decoded->iss !== 'backend') {
			return new DataResponse([], Http::STATUS_UNAUTHORIZED);
		}

		$query = $this->db->getQueryBuilder();
		// Try modifying the item first...
		$query->update('pdfdraw_items')
			->set('data', $query->createNamedParameter($data))
			->set('page', $query->createNamedParameter($page, IQueryBuilder::PARAM_INT))
			->where($query->expr()->eq('file_id', $query->createNamedParameter($fileId)))
			->andWhere($query->expr()->eq('name', $query->createNamedParameter($name)));
		$result = $query->execute();
		if ($result === 0) {
			// ...and create it if it didn't exist before.
			$query->insert('pdfdraw_items')
				->values(
					[
						'file_id' => $query->createNamedParameter($fileId),
						'page' => $query->createNamedParameter($page, IQueryBuilder::PARAM_INT),
						'name' => $query->createNamedParameter($name),
						'data' => $query->createNamedParameter($data),
					]
				);
			try {
				$query->execute();
			} catch (UniqueConstraintViolationException $e) {
				// Ignore, another request created the item.
			}
		}
		return new DataResponse([]);
	}

	/**
	 * Remove item from page of a file.
	 *
	 * @PublicPage
	 * @NoCSRFRequired
	 *
	 * @param string $fileId
	 * @param int $page
	 * @param string $name
	 * @return DataResponse
	 */
	public function deleteItem(string $fileId, int $page, string $name) {
		$decoded = $this->decodeToken($fileId);
		if (empty($decoded)) {
			return new DataResponse([], Http::STATUS_UNAUTHORIZED);
		}

		if ($decoded->iss !== 'backend') {
			return new DataResponse([], Http::STATUS_UNAUTHORIZED);
		}

		$query = $this->db->getQueryBuilder();
		$query->delete('pdfdraw_items')
			->where($query->expr()->eq('file_id', $query->createNamedParameter($fileId)))
			->andWhere($query->expr()->eq('page', $query->createNamedParameter($page)))
			->andWhere($query->expr()->eq('name', $query->createNamedParameter($name)));
		$query->execute();
		return new DataResponse([]);
	}

	/**
	 * Download file by id.
	 *
	 * @PublicPage
	 * @NoCSRFRequired
	 *
	 * @param string $fileId
	 * @return DataResponse
	 */
	public function downloadFile(string $fileId) {
		$decoded = $this->decodeToken($fileId);
		if (empty($decoded)) {
			return new DataResponse([], Http::STATUS_UNAUTHORIZED);
		}

		$mountPoints = $this->userMountCache->getMountsForFileId($fileId);
		if (empty($mountPoints)) {
			return new DataResponse([], Http::STATUS_NOT_FOUND);
		}

		foreach ($mountPoints as $mountPoint) {
			try {
				$userId = $mountPoint->getUser()->getUID();
				$userFolder = $this->root->getUserFolder($userId);
				if (!Filesystem::$loaded) {
					// Filesystem wasn't loaded for anyone,
					// so we boot it up in order to make hooks in the View work.
					Filesystem::init($userId, '/' . $userId . '/files');
				}
			} catch (\Exception $e) {
				$this->logger->debug($e->getMessage(), [
					'app' => $this->appName,
					'exception' => $e,
				]);
				continue;
			}

			$files = $userFolder->getById($fileId);
			if (empty($files)) {
				continue;
			}

			foreach ($files as $file) {
				if ($file->isReadable()) {
					return new DataDownloadResponse($file->getContent(), $file->getName(), $file->getMimeType());
				}

				$this->logger->debug('Mount point ' . ($mountPoint->getMountId() ?? 'null') . ' has access to file ' . $file->getId() . ' but permissions are ' . $file->getPermissions(), [
					'app' => $this->appName,
				]);
			}
		}

		return new DataResponse([], Http::STATUS_NOT_FOUND);
	}

}
