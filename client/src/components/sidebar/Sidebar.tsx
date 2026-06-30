import { Link } from 'react-router';
import styled from 'styled-components';

const Aside = styled.aside`
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	padding: 1rem;
	background: #1f2937;
	color: #fff;
`;

const Heading = styled.h2`
	font-size: 1.125rem;
	font-weight: 700;
	margin-bottom: 1rem;
`;

const NavLink = styled(Link)`
	display: block;
	padding: 0.5rem 1rem;
	color: inherit;
	text-decoration: none;
	&:hover {
		background: #374151;
	}
`;

export const Sidebar = () => {
	const deviceIds: any = ['1234', '818181', '919191'];

	return (
		<Aside>
			<Heading>Devices</Heading>
			<nav style={{ flex: 1 }}>
				<ul>
					{deviceIds.map((deviceId) => (
						<li key={deviceId}>
							<NavLink to={`/device/${deviceId}`}>Device {deviceId}</NavLink>
						</li>
					))}
				</ul>
			</nav>
		</Aside>
	);
};
